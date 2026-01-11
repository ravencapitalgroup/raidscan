import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { symbols } = await req.json();
    const limit = 10;

    console.log(`Starting POI data update for all symbols`);

    // Get all symbols if not provided
    let symbolsToProcess = symbols;
    if (!symbolsToProcess || !Array.isArray(symbolsToProcess)) {
      const allAssets = await base44.asServiceRole.entities.WatchlistAsset.list();
      symbolsToProcess = allAssets.map(a => a.symbol);
      console.log(`Fetched ${symbolsToProcess.length} symbols from database`);
    }

    const timeframes = ['1w', '1M'];
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper function to fetch klines from endpoints
    const fetchKlinesInternal = async (sym, timeframe) => {
      const endpoints = [
        `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${timeframe}&limit=${limit}`,
        `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${timeframe}&limit=${limit}`,
        `https://api.binance.us/api/v3/klines?symbol=${sym}&interval=${timeframe}&limit=${limit}`
      ];

      for (const url of endpoints) {
        try {
          const response = await fetch(url);

          // Check for restricted location error
          if (response.status === 451) {
            continue; // Try next endpoint
          }

          const data = await response.json();

          if (Array.isArray(data)) {
            console.log(`Got ${data.length} candles for ${sym}-${timeframe}`);
            return { data, success: true };
          }
        } catch (err) {
          console.log(`Error fetching from ${url}: ${err.message}`);
          continue;
        }
      }

      return { data: [], success: false };
    };

    // Fetch klines with retry logic and exponential backoff
    const fetchKlinesWithRetry = async (sym, timeframe, retries = 3) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        const { data, success } = await fetchKlinesInternal(sym, timeframe);
        if (success) {
          return data;
        }

        if (attempt < retries) {
          const backoffMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s exponential backoff
          console.warn(`Attempt ${attempt}/${retries} for ${sym}-${timeframe} failed. Cooling off for ${backoffMs}ms before retry...`);
          await delay(backoffMs);
        }
      }

      console.error(`Failed to fetch klines for ${sym}-${timeframe} after ${retries} attempts`);
      return [];
    };

    let insertedCount = 0;

    // Process each symbol with rate limiting
    for (let i = 0; i < symbolsToProcess.length; i++) {
      const symbol = symbolsToProcess[i];
      const candlesForSymbol = [];

      for (const timeframe of timeframes) {
        const data = await fetchKlinesWithRetry(symbol, timeframe);

        if (Array.isArray(data) && data.length > 0) {
          // Delete existing data for this symbol/timeframe in batches
          const existingData = await base44.asServiceRole.entities.PoiData.filter({ symbol, timeframe });
          for (let j = 0; j < existingData.length; j += 50) {
            const batch = existingData.slice(j, j + 50);
            for (const record of batch) {
              await base44.asServiceRole.entities.PoiData.delete(record.id);
            }
            if (j + 50 < existingData.length) {
              await delay(100); // Delay between delete batches
            }
          }

          // Transform Binance kline response to our schema
          const candles = data.map(kline => ({
            symbol,
            timeframe,
            timestamp: kline[0],
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[7]),
            quoteAssetVolume: parseFloat(kline[8]),
            numberOfTrades: parseInt(kline[8]),
            takerBuyBaseAssetVolume: parseFloat(kline[9]),
            takerBuyQuoteAssetVolume: parseFloat(kline[10])
          }));
          
          candlesForSymbol.push(...candles);
        }

        // Delay between timeframe requests
        if (timeframes.indexOf(timeframe) < timeframes.length - 1) {
          await delay(300);
        }
      }

      // Bulk insert candles for this symbol in smaller batches
      if (candlesForSymbol.length > 0) {
        const batchSize = 100;
        for (let j = 0; j < candlesForSymbol.length; j += batchSize) {
          const batch = candlesForSymbol.slice(j, j + batchSize);
          try {
            const result = await base44.asServiceRole.entities.PoiData.bulkCreate(batch);
            insertedCount += result?.length || batch.length;
            console.log(`Inserted ${batch.length} candles for ${symbol}`);
          } catch (err) {
            console.error(`BulkCreate error for ${symbol}: ${err.message}`);
          }
          
          if (j + batchSize < candlesForSymbol.length) {
            await delay(100);
          }
        }
      }

      // Delay between symbols to avoid rate limiting
      if (i < symbolsToProcess.length - 1) {
        await delay(500);
      }
    }

    return Response.json({
      success: true,
      processedSymbols: symbolsToProcess.length,
      insertedCount: insertedCount,
      candlesCollected: allCandles.length,
      message: `Updated POI data for ${symbolsToProcess.length} symbols`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});