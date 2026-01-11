import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Helper to fetch with fallback to US endpoint
const fetchWithFallback = async (endpoints) => {
  for (const url of endpoints) {
    try {
      const response = await fetch(url);
      if (response.status === 451) {
        console.log(`Endpoint ${url} restricted, trying next endpoint`);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      console.log(`Failed to fetch ${url}:`, err.message);
      continue;
    }
  }
  throw new Error('All endpoints failed');
};

// Helper to fetch klines for a symbol
const fetchKlines = async (symbol, interval, limit = 100) => {
  const endpoints = [
    `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    `https://fapi.binance.us/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  ];
  
  try {
    const data = await fetchWithFallback(endpoints);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`Failed to fetch klines for ${symbol}:`, err.message);
    return [];
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch exchange info from Binance with fallback
    const exchangeData = await fetchWithFallback([
      'https://fapi.binance.com/fapi/v1/exchangeInfo',
      'https://fapi.binance.us/fapi/v1/exchangeInfo'
    ]);

    const symbols = exchangeData.symbols
      .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
      .map(s => ({
        symbol: s.symbol,
        category: 'Other',
        is_active: false,
        new_added_date: new Date().toISOString()
      }));

    console.log(`Fetched ${symbols.length} trading symbols from Binance`);

    // Get existing symbols
    const existingAssets = await base44.asServiceRole.entities.WatchlistAsset.list();
    const existingSymbols = new Set(existingAssets.map(a => a.symbol));

    // Filter out existing symbols
    const newSymbols = symbols.filter(s => !existingSymbols.has(s.symbol));
    console.log(`Found ${newSymbols.length} new symbols to add`);

    // Bulk create new assets
    if (newSymbols.length > 0) {
      await base44.asServiceRole.entities.WatchlistAsset.bulkCreate(newSymbols);
      
      // Fetch historic POI data for new symbols
      console.log(`Fetching historic data for ${newSymbols.length} new symbols`);
      for (const newAsset of newSymbols) {
        const weeklyKlines = await fetchKlines(newAsset.symbol, '1w', 100);
        const monthlyKlines = await fetchKlines(newAsset.symbol, '1M', 100);
        
        const poiData = [];
        
        // Process weekly klines
        if (weeklyKlines.length > 0) {
          for (const kline of weeklyKlines) {
            poiData.push({
              symbol: newAsset.symbol,
              timeframe: '1w',
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
            });
          }
        }
        
        // Process monthly klines
        if (monthlyKlines.length > 0) {
          for (const kline of monthlyKlines) {
            poiData.push({
              symbol: newAsset.symbol,
              timeframe: '1M',
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
            });
          }
        }
        
        if (poiData.length > 0) {
          await base44.asServiceRole.entities.PoiData.bulkCreate(poiData);
          console.log(`Added ${poiData.length} POI records for ${newAsset.symbol}`);
        }
      }
    }

    return Response.json({
      success: true,
      totalSymbols: symbols.length,
      newSymbolsAdded: newSymbols.length,
      message: `Synced ${symbols.length} symbols, added ${newSymbols.length} new ones with historic data`
    });
  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});