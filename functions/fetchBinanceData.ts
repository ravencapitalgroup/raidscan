import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { symbols } = await req.json();

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return Response.json({ error: 'symbols array is required' }, { status: 400 });
    }

    const results = {};

    for (const symbol of symbols) {
      const ticker = symbol.includes('USDT') ? symbol : `${symbol}USDT`;
      
      try {
        // Fetch 24h ticker data from Binance
        const tickerRes = await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${ticker}`);
        const tickerData = await tickerRes.json();

        if (tickerData.code) {
          console.error(`Binance error for ${ticker}:`, tickerData.msg);
          continue;
        }

        results[symbol] = {
          symbol: symbol,
          price: parseFloat(tickerData.lastPrice),
          change24h: parseFloat(tickerData.priceChangePercent),
          volume24h: parseFloat(tickerData.volume)
        };
      } catch (error) {
        console.error(`Error fetching data for ${ticker}:`, error.message);
        results[symbol] = { error: error.message };
      }
    }

    return Response.json(results);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});