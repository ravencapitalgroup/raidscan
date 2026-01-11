import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const limit = 10;
    const batchSize = 20;
    const cooldownMs = 60000;

    console.log(`Starting POI data update for Binance US`);

    const binanceUSAssets = await base44.asServiceRole.entities.WatchlistAsset.filter({ source: 'binanceus' });
    console.log(`Fetched ${binanceUSAssets.length} Binance US symbols`);

    const timeframes = ['1w', '1M'];
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const fetchKlines = async (sym, timeframe, endpoint) => {
      try {
        const response = await fetch(endpoint);
        await delay(2000);

        if (response.status === 429) {
          return { data: [], success: false, rateLimited: true };
        }
        if (response.status === 451) {
          return { data: [], success: false, rateLimited: false };
        }

        const data = await response.json();
        if (Array.isArray(data)) {
          console.log(`Got ${data.length} candles for ${sym}-${timeframe}`);
          return { data, success: true };
        }
      } catch (err) {
        console.log(`Error fetching from ${endpoint}: ${err.message}`);
        await delay(2000);
      }

      return { data: [], success: false, rateLimited: false };
    };

    const fetchKlinesWithRetry = async (sym, timeframe, endpoints, retries = 2) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        for (const endpoint of endpoints) {
          const { data, success, rateLimited } = await fetchKlines(sym, timeframe, endpoint);
          if (success) {
            return data;
          }

          if (rateLimited) {
            console.warn(`Rate limited (429) for ${sym}-${timeframe}. Stopping execution.`);
            throw new Error('RATE_LIMIT_HIT');
          }
        }

        if (attempt < retries) {
          const backoffMs = Math.pow(2, attempt - 1) * 5000;
          console.warn(`Attempt ${attempt}/${retries} for ${sym}-${timeframe} failed. Cooling off for ${backoffMs}ms`);
          await delay(backoffMs);
        }
      }

      return [];
    };

    let binanceUSTotalInserted = 0;
    let binanceUSRateLimitHit = false;

    const binanceUSSymbols = binanceUSAssets.map(a => a.symbol);
    const binanceUSNumBatches = Math.ceil(binanceUSSymbols.length / batchSize);

    for (let batchIndex = 0; batchIndex < binanceUSNumBatches; batchIndex++) {
      if (binanceUSRateLimitHit) break;

      const startIdx = batchIndex * batchSize;
      const endIdx = Math.min(startIdx + batchSize, binanceUSSymbols.length);
      const symbolsInBatch = binanceUSSymbols.slice(startIdx, endIdx);

      console.log(`Batch ${batchIndex + 1}/${binanceUSNumBatches} (symbols ${startIdx + 1}-${endIdx})`);

      for (let i = 0; i < symbolsInBatch.length; i++) {
        if (binanceUSRateLimitHit) break;

        const symbol = symbolsInBatch[i];
        const candlesForSymbol = [];

        try {
          for (const timeframe of timeframes) {
            const binanceUSEndpoints = [
              `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`
            ];

            const data = await fetchKlinesWithRetry(symbol, timeframe, binanceUSEndpoints);

            if (Array.isArray(data) && data.length > 0) {
              const existingData = await base44.asServiceRole.entities.PoiDataBinanceUS.filter({ symbol, timeframe });
              for (let j = 0; j < existingData.length; j += 50) {
                const batch = existingData.slice(j, j + 50);
                for (const record of batch) {
                  await base44.asServiceRole.entities.PoiDataBinanceUS.delete(record.id);
                }
                if (j + 50 < existingData.length) {
                  await delay(100);
                }
              }

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

            if (timeframes.indexOf(timeframe) < timeframes.length - 1) {
              await delay(1500);
            }
          }

          if (candlesForSymbol.length > 0) {
            const insertBatchSize = 100;
            for (let j = 0; j < candlesForSymbol.length; j += insertBatchSize) {
              const batch = candlesForSymbol.slice(j, j + insertBatchSize);
              try {
                const result = await base44.asServiceRole.entities.PoiDataBinanceUS.bulkCreate(batch);
                binanceUSTotalInserted += result?.length || batch.length;
                console.log(`Inserted ${batch.length} candles for ${symbol}`);
              } catch (err) {
                console.error(`BulkCreate error for ${symbol}: ${err.message}`);
              }

              if (j + insertBatchSize < candlesForSymbol.length) {
                await delay(200);
              }
            }
          }

          if (i < symbolsInBatch.length - 1) {
            await delay(3000);
          }
        } catch (err) {
          if (err.message === 'RATE_LIMIT_HIT') {
            console.error(`Rate limit hit while processing ${symbol}.`);
            binanceUSRateLimitHit = true;
            break;
          }
          console.error(`Error processing ${symbol}: ${err.message}`);
        }
      }

      if (batchIndex < binanceUSNumBatches - 1 && !binanceUSRateLimitHit) {
        console.log(`Cooling down for 1 minute before next batch...`);
        await delay(cooldownMs);
      }
    }

    return Response.json({
      success: !binanceUSRateLimitHit,
      binanceUS: {
        totalSymbols: binanceUSSymbols.length,
        totalCandles: binanceUSTotalInserted,
        rateLimitHit: binanceUSRateLimitHit
      },
      message: `Updated POI data for Binance US (${binanceUSTotalInserted} candles)`
    });
  } catch (error) {
    console.error(`Fatal error in getPoiDataBinanceUS: ${error.message}`);
    return Response.json({
      success: false,
      error: error.message,
      message: 'Error during execution.'
    }, { status: 200 });
  }
});