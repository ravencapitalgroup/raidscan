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

    // Helper function to fetch from Binance with fallback to Binance US
    const fetchWithFallback = async (symbol) => {
      const endpoints = [
        `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
        `https://api.binance.us/api/v3/ticker/24hr?symbol=${symbol}`
      ];

      for (const url of endpoints) {
        try {
          const response = await fetch(url);
          const data = await response.json();

          // Check for restricted location error
          if (data.code === -1022 || response.status === 451) {
            continue; // Try next endpoint
          }

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
          // Continue to next endpoint on error
          continue;
        }
      }

      return { symbol, error: 'Failed to fetch from all endpoints' };
    };

    // Fetch 24hr ticker data from Binance for each symbol
    const prices = await Promise.all(
      symbols.map(symbol => fetchWithFallback(symbol))
    );

    return Response.json({ prices });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});