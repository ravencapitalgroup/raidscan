import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { symbols, startIndex = 0 } = await req.json();
    const limit = 10;
    const batchSize = 10; // Process 10 symbols per execution

    console.log(`Starting POI data update (startIndex: ${startIndex})`);

    // Get all symbols if not provided
    let symbolsToProcess = symbols;
    if (!symbolsToProcess || !Array.isArray(symbolsToProcess)) {
      const allAssets = await base44.asServiceRole.entities.WatchlistAsset.list();
      symbolsToProcess = allAssets.map(a => a.symbol);
      console.log(`Fetched ${symbolsToProcess.length} total symbols from database`);
      
      // Process only batch of symbols starting from startIndex
      symbolsToProcess = symbolsToProcess.slice(startIndex, startIndex + batchSize);
      console.log(`Processing ${symbolsToProcess.length} symbols in this batch (indices ${startIndex}-${startIndex + symbolsToProcess.length - 1})`);
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

          // Check for rate limit error
          if (response.status === 429) {
            return { data: [], success: false, rateLimited: true };
          }

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

      return { data: [], success: false, rateLimited: false };
    };

    // Fetch klines with retry logic and 429 handling
    const fetchKlinesWithRetry = async (sym, timeframe, retries = 2) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        const { data, success, rateLimited } = await fetchKlinesInternal(sym, timeframe);
        if (success) {
          return data;
        }

        if (attempt < retries) {
          let backoffMs;
          if (rateLimited) {
            // Aggressive backoff for rate limiting - exit on first 429
            console.warn(`Rate limited (429) for ${sym}-${timeframe}. Stopping execution to preserve API quota.`);
            throw new Error('RATE_LIMIT_HIT');
          } else {
            backoffMs = Math.pow(2, attempt - 1) * 5000; // 5s, 10s exponential backoff
            console.warn(`Attempt ${attempt}/${retries} for ${sym}-${timeframe} failed. Cooling off for ${backoffMs}ms before retry...`);
            await delay(backoffMs);
          }
        }
      }

      console.error(`Failed to fetch klines for ${sym}-${timeframe} after ${retries} attempts`);
      return [];
    };

    let insertedCount = 0;
    let rateLimitHit = false;

    // Process each symbol with rate limiting
    for (let i = 0; i < symbolsToProcess.length; i++) {
      const symbol = symbolsToProcess[i];
      const candlesForSymbol = [];

      try {
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
            await delay(1500);
          }
        }

        // Bulk insert candles for this symbol in smaller batches
        if (candlesForSymbol.length > 0) {
          const insertBatchSize = 100;
          for (let j = 0; j < candlesForSymbol.length; j += insertBatchSize) {
            const batch = candlesForSymbol.slice(j, j + insertBatchSize);
            try {
              const result = await base44.asServiceRole.entities.PoiData.bulkCreate(batch);
              insertedCount += result?.length || batch.length;
              console.log(`Inserted ${batch.length} candles for ${symbol}`);
            } catch (err) {
              console.error(`BulkCreate error for ${symbol}: ${err.message}`);
            }
            
            if (j + insertBatchSize < candlesForSymbol.length) {
              await delay(200);
            }
          }
        }

        // Delay between symbols to avoid rate limiting
        if (i < symbolsToProcess.length - 1) {
          await delay(3000);
        }
      } catch (err) {
        if (err.message === 'RATE_LIMIT_HIT') {
          console.error(`Rate limit hit while processing ${symbol}. Stopping execution.`);
          rateLimitHit = true;
          break;
        }
        console.error(`Error processing ${symbol}: ${err.message}`);
      }
    }

    // Sort all PoiData by timestamp (earliest to oldest)
    console.log('Sorting all PoiData records by timestamp...');
    try {
      const allPoiData = await base44.asServiceRole.entities.PoiData.list();
      if (allPoiData.length > 0) {
        const sorted = allPoiData.sort((a, b) => a.timestamp - b.timestamp);
        console.log(`Sorted ${sorted.length} PoiData records from earliest to oldest`);
      }
    } catch (err) {
      console.error(`Error sorting PoiData: ${err.message}`);
    }

    return Response.json({
      success: !rateLimitHit,
      processedSymbols: symbolsToProcess.length,
      insertedCount: insertedCount,
      rateLimitHit: rateLimitHit,
      message: rateLimitHit 
        ? `Rate limit hit. Processed up to ${insertedCount} candles. Retry in next execution.`
        : `Updated POI data for ${symbolsToProcess.length} symbols (${insertedCount} candles inserted)`
    });
  } catch (error) {
    console.error(`Fatal error in populatePoiData: ${error.message}`);
    // Return 200 instead of 500 to prevent scheduler from retrying immediately
    return Response.json({ 
      success: false,
      error: error.message,
      message: 'Error during execution. Will retry in next scheduled run.'
    }, { status: 200 });
  }
});