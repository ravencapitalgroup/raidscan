import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { symbol, limit = 100 } = await req.json();

    if (!symbol || typeof symbol !== 'string') {
      return Response.json({ error: 'symbol string is required' }, { status: 400 });
    }

    const timeframes = ['1w', '1M'];
    const allCandles = [];

    // Fetch klines for each timeframe
    for (const timeframe of timeframes) {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
        console.log(`Fetching: ${url}`);
        
        const response = await fetch(url);
        console.log(`Response status: ${response.status}`);
        const data = await response.json();
        console.log(`Data for ${symbol}-${timeframe}:`, JSON.stringify(data).slice(0, 200));

        if (Array.isArray(data)) {
          console.log(`Got ${data.length} candles for ${symbol}-${timeframe}`);
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
            quoteAssetVolume: parseFloat(kline[7]),
            numberOfTrades: kline[8],
            takerBuyBaseAssetVolume: parseFloat(kline[9]),
            takerBuyQuoteAssetVolume: parseFloat(kline[10])
          }));
          
          allCandles.push(...candles);
        } else {
          console.log(`NOT an array. Data is: ${JSON.stringify(data)}`);
        }
    }

    // Bulk insert into PoiData
    if (allCandles.length > 0) {
      await base44.entities.PoiData.bulkCreate(allCandles);
    }

    return Response.json({
      success: true,
      insertedCount: allCandles.length,
      message: `Inserted ${allCandles.length} POI candles (weekly and monthly)`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});