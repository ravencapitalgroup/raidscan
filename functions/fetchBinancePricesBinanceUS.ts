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

    const fetchPricesFromBinanceUS = async (symbol) => {
      const endpoint = `https://api.binance.us/api/v3/ticker/24hr?symbol=${symbol}`;

      try {
        const response = await fetch(endpoint);
        const data = await response.json();

        if (data.code) {
          return { symbol, error: data.msg || 'Failed to fetch price' };
        }

        return {
          symbol: data.symbol,
          lastPrice: parseFloat(data.lastPrice),
          priceChangePercent: parseFloat(data.priceChangePercent),
          volume: parseFloat(data.volume),
          quoteAssetVolume: parseFloat(data.quoteAssetVolume)
        };
      } catch (err) {
        return { symbol, error: err.message || 'Failed to fetch from Binance US' };
      }
    };

    const prices = await Promise.all(
      symbols.map(symbol => fetchPricesFromBinanceUS(symbol))
    );

    return Response.json({ prices });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});