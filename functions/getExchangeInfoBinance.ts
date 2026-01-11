import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('Starting Binance exchange info fetch');

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Fetch Binance Futures symbols
    let futuresSymbols = [];
    try {
      const futuresRes = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
      await delay(500);
      const futuresData = await futuresRes.json();
      futuresSymbols = futuresData.symbols
        .filter(s => s.status === 'TRADING' && s.symbol.endsWith('USDT'))
        .map(s => ({ symbol: s.symbol, is_futures: true, is_spot: false, source: 'binance' }));
      console.log(`Fetched ${futuresSymbols.length} Binance Futures symbols`);
    } catch (err) {
      console.error('Error fetching Binance Futures:', err.message);
    }

    // Fetch Binance Spot symbols
    let spotSymbols = [];
    try {
      const spotRes = await fetch('https://api.binance.com/api/v3/exchangeInfo');
      await delay(500);
      const spotData = await spotRes.json();
      spotSymbols = spotData.symbols
        .filter(s => s.status === 'TRADING' && s.symbol.endsWith('USDT'))
        .map(s => ({ symbol: s.symbol, is_futures: false, is_spot: true, source: 'binance' }));
      console.log(`Fetched ${spotSymbols.length} Binance Spot symbols`);
    } catch (err) {
      console.error('Error fetching Binance Spot:', err.message);
    }

    // Merge futures and spot symbols
    const symbolMap = new Map();
    futuresSymbols.forEach(s => {
      const existing = symbolMap.get(s.symbol);
      symbolMap.set(s.symbol, {
        symbol: s.symbol,
        is_futures: existing ? true : s.is_futures,
        is_spot: existing ? existing.is_spot : false,
        source: 'binance'
      });
    });
    spotSymbols.forEach(s => {
      const existing = symbolMap.get(s.symbol);
      symbolMap.set(s.symbol, {
        symbol: s.symbol,
        is_futures: existing ? existing.is_futures : false,
        is_spot: true,
        source: 'binance'
      });
    });

    const allBinanceSymbols = Array.from(symbolMap.values());
    console.log(`Total unique Binance symbols: ${allBinanceSymbols.length}`);

    // Get existing symbols
    const existingAssets = await base44.asServiceRole.entities.WatchlistAssetBinance.list();
    const existingSymbols = new Set(existingAssets.map(a => a.symbol));

    // Find new symbols to add
    const newSymbols = allBinanceSymbols.filter(s => !existingSymbols.has(s.symbol));
    console.log(`New symbols to add: ${newSymbols.length}`);

    if (newSymbols.length > 0) {
      // Bulk create new assets
      const assetsToCreate = newSymbols.map(s => ({
        symbol: s.symbol,
        is_active: true,
        category: 'Other',
        is_futures: s.is_futures,
        is_spot: s.is_spot
      }));

      const batchSize = 100;
      for (let i = 0; i < assetsToCreate.length; i += batchSize) {
        const batch = assetsToCreate.slice(i, i + batchSize);
        await base44.asServiceRole.entities.WatchlistAssetBinance.bulkCreate(batch);
        console.log(`Created ${batch.length} assets`);
        if (i + batchSize < assetsToCreate.length) {
          await delay(500);
        }
      }
    }

    // Update existing symbols with new futures/spot status
    for (const asset of existingAssets) {
      const updated = allBinanceSymbols.find(s => s.symbol === asset.symbol);
      if (updated && (asset.is_futures !== updated.is_futures || asset.is_spot !== updated.is_spot)) {
        await base44.asServiceRole.entities.WatchlistAssetBinance.update(asset.id, {
          is_futures: updated.is_futures,
          is_spot: updated.is_spot
        });
      }
    }

    // Mark symbols no longer on exchange as inactive
    const currentSymbolSet = new Set(allBinanceSymbols.map(s => s.symbol));
    for (const asset of existingAssets) {
      if (!currentSymbolSet.has(asset.symbol) && asset.is_active) {
        await base44.asServiceRole.entities.WatchlistAssetBinance.update(asset.id, { is_active: false });
      }
    }

    return Response.json({
      success: true,
      binance: {
        totalSymbols: allBinanceSymbols.length,
        newAdded: newSymbols.length,
        futuresSymbols: futuresSymbols.length,
        spotSymbols: spotSymbols.length
      },
      message: `Updated Binance exchange info (${newSymbols.length} new symbols)`
    });
  } catch (error) {
    console.error('getExchangeInfoBinance error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});