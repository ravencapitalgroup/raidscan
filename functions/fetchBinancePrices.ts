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
      return Response.json({ error: 'symbols array is required' }, { status: 400 });
    }

    // Fetch 24hr ticker data from Binance for each symbol
    const prices = await Promise.all(
      symbols.map(async (symbol) => {
        const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.code) {
          // Error from Binance
          return {
            symbol,
            error: data.msg || 'Failed to fetch price'
          };
        }

        return {
          symbol: data.symbol,
          lastPrice: parseFloat(data.lastPrice),
          priceChangePercent: parseFloat(data.priceChangePercent),
          volume: parseFloat(data.volume),
          quoteAssetVolume: parseFloat(data.quoteAssetVolume)
        };
      })
    );

    return Response.json({ prices });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});