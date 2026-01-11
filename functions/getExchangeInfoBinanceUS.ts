import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('Starting Binance US exchange info fetch');

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Fetch Binance US Spot symbols
    let usSpotSymbols = [];
    try {
      const usSpotRes = await fetch('https://api.binance.us/api/v3/exchangeInfo');
      await delay(500);
      const usSpotData = await usSpotRes.json();
      usSpotSymbols = usSpotData.symbols
        .filter(s => s.status === 'TRADING' && s.symbol.endsWith('USDT'))
        .map(s => ({ symbol: s.symbol, is_futures: false, is_spot: true, source: 'binanceus' }));
      console.log(`Fetched ${usSpotSymbols.length} Binance US Spot symbols`);
    } catch (err) {
      console.error('Error fetching Binance US Spot:', err.message);
    }

    console.log(`Total Binance US symbols: ${usSpotSymbols.length}`);

    // Get existing symbols
    const existingAssets = await base44.asServiceRole.entities.WatchlistAssetBinanceUS.list();
    const existingSymbols = new Set(existingAssets.map(a => a.symbol));

    // Find new symbols to add
    const newSymbols = usSpotSymbols.filter(s => !existingSymbols.has(s.symbol));
    console.log(`New symbols to add: ${newSymbols.length}`);

    if (newSymbols.length > 0) {
      // Bulk create new assets
      const assetsToCreate = newSymbols.map(s => ({
        symbol: s.symbol,
        is_active: true,
        category: 'Other',
        is_futures: false,
        is_spot: true
      }));

      const batchSize = 100;
      for (let i = 0; i < assetsToCreate.length; i += batchSize) {
        const batch = assetsToCreate.slice(i, i + batchSize);
        await base44.asServiceRole.entities.WatchlistAssetBinanceUS.bulkCreate(batch);
        console.log(`Created ${batch.length} assets`);
        if (i + batchSize < assetsToCreate.length) {
          await delay(500);
        }
      }
    }

    // Mark symbols no longer on exchange as inactive
    const currentSymbolSet = new Set(usSpotSymbols.map(s => s.symbol));
    for (const asset of existingAssets) {
      if (!currentSymbolSet.has(asset.symbol) && asset.is_active) {
        await base44.asServiceRole.entities.WatchlistAssetBinanceUS.update(asset.id, { is_active: false });
      }
    }

    return Response.json({
      success: true,
      binanceUS: {
        totalSymbols: usSpotSymbols.length,
        newAdded: newSymbols.length,
        spotSymbols: usSpotSymbols.length
      },
      message: `Updated Binance US exchange info (${newSymbols.length} new symbols)`
    });
  } catch (error) {
    console.error('getExchangeInfoBinanceUS error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});