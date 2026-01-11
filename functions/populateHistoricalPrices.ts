import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { symbols, interval = '1d', limit = 100 } = await req.json();

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return Response.json({ error: 'symbols array is required' }, { status: 400 });
    }

    const allCandles = [];

    // Fetch klines for each symbol
    for (const symbol of symbols) {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (Array.isArray(data)) {
        // Transform Binance kline response to our schema
        const candles = data.map(kline => ({
          symbol,
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
      }
    }

    // Bulk insert into HistoricalPrice
    if (allCandles.length > 0) {
      await base44.entities.HistoricalPrice.bulkCreate(allCandles);
    }

    return Response.json({
      success: true,
      insertedCount: allCandles.length,
      message: `Inserted ${allCandles.length} price candles`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});