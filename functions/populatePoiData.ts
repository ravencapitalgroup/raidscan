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
    const allCandles = [];

    // Helper function to fetch klines with fallback to Binance US
    const fetchKlines = async (sym, timeframe) => {
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
            return data;
          }
        } catch (err) {
          console.log(`Error fetching from ${url}: ${err.message}`);
          continue;
        }
      }

      return [];
    };

    // Process each symbol
    for (const symbol of symbolsToProcess) {
      for (const timeframe of timeframes) {
        const data = await fetchKlines(symbol, timeframe);

        if (Array.isArray(data) && data.length > 0) {
          // Delete existing data for this symbol/timeframe
          const existingData = await base44.asServiceRole.entities.PoiData.filter({ symbol, timeframe });
          for (const record of existingData) {
            await base44.asServiceRole.entities.PoiData.delete(record.id);
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
          
          allCandles.push(...candles);
        }
      }
    }

    // Bulk insert into PoiData
    let insertedCount = 0;
    if (allCandles.length > 0) {
      console.log(`Attempting to insert ${allCandles.length} candles`);
      
      try {
        const result = await base44.entities.PoiData.bulkCreate(allCandles);
        insertedCount = result?.length || allCandles.length;
        console.log(`Successfully inserted ${insertedCount} candles`);
      } catch (err) {
        console.error(`BulkCreate error: ${err.message}`);
        throw err;
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