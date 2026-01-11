import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Fetch klines with fallback to avoid geo-restrictions
const fetchKlinesWithFallback = async (symbol, interval, limit = 100) => {
  const endpoints = [
    `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    `https://api.binance.us/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url);
      if (response.status === 451) {
        console.log(`Endpoint ${url} restricted, trying next`);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      console.log(`Failed to fetch from ${url}:`, err.message);
      continue;
    }
  }
  throw new Error(`All endpoints failed for ${symbol}`);
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { symbol, interval = '1h', limit = 50 } = body;

    if (!symbol) {
      return Response.json({ error: 'Symbol is required' }, { status: 400 });
    }

    const klines = await fetchKlinesWithFallback(symbol, interval, limit);

    // Transform klines to readable format
    const formattedKlines = klines.map(kline => ({
      timestamp: parseInt(kline[0]),
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[7]),
      quoteAssetVolume: parseFloat(kline[8]),
      numberOfTrades: parseInt(kline[8])
    }));

    return Response.json({
      success: true,
      symbol,
      interval,
      data: formattedKlines
    });
  } catch (error) {
    console.error('Klines fetch error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});