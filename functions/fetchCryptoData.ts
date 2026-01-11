import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { symbols } = await req.json();

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return Response.json({ error: 'Invalid symbols array' }, { status: 400 });
    }

    // Fetch data from Binance API directly
    const symbolsStr = symbols.join(',');
    const tickersUrl = `https://fapi.binance.com/fapi/v1/ticker/24hr?symbols=[${symbols.map(s => `"${s}"`).join(',')}]`;
    
    const response = await fetch(tickersUrl);
    const data = await response.json();

    if (!Array.isArray(data)) {
      return Response.json({ error: 'Failed to fetch data from Binance' }, { status: 500 });
    }

    const prices = data.reduce((acc, item) => {
      acc[item.symbol] = {
        price: parseFloat(item.lastPrice),
        change24h: parseFloat(item.priceChangePercent),
        high24h: parseFloat(item.highPrice),
        low24h: parseFloat(item.lowPrice)
      };
      return acc;
    }, {});

    return Response.json({ prices });
  } catch (error) {
    console.error('Error fetching crypto data:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});