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

    // Fetch data from Binance API - fetch each symbol individually for reliability
    const prices = {};
    
    for (const symbol of symbols) {
      try {
        const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`);
        if (!response.ok) {
          console.error(`Failed to fetch ${symbol}:`, response.status);
          continue;
        }
        
        const data = await response.json();
        prices[data.symbol] = {
          price: parseFloat(data.lastPrice),
          change24h: parseFloat(data.priceChangePercent),
          high24h: parseFloat(data.highPrice),
          low24h: parseFloat(data.lowPrice)
        };
      } catch (err) {
        console.error(`Error fetching ${symbol}:`, err.message);
      }
    }

    if (Object.keys(prices).length === 0) {
      return Response.json({ error: 'No prices fetched' }, { status: 500 });
    }

    return Response.json({ prices });
  } catch (error) {
    console.error('Error fetching crypto data:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});