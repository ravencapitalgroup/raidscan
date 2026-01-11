import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch exchange info from Binance
    const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json();
    const symbols = data.symbols
      .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
      .map(s => ({
        symbol: s.symbol,
        category: 'Other',
        is_active: false
      }));

    console.log(`Fetched ${symbols.length} trading symbols from Binance`);

    // Get existing symbols to avoid duplicates
    const existingAssets = await base44.asServiceRole.entities.WatchlistAsset.list();
    const existingSymbols = new Set(existingAssets.map(a => a.symbol));

    // Filter out existing symbols
    const newSymbols = symbols.filter(s => !existingSymbols.has(s.symbol));
    console.log(`Found ${newSymbols.length} new symbols to add`);

    // Bulk create new assets
    if (newSymbols.length > 0) {
      await base44.asServiceRole.entities.WatchlistAsset.bulkCreate(newSymbols);
      console.log(`Successfully added ${newSymbols.length} new symbols`);
    }

    return Response.json({
      success: true,
      totalSymbols: symbols.length,
      newSymbolsAdded: newSymbols.length,
      message: `Synced ${symbols.length} symbols, added ${newSymbols.length} new ones`
    });
  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});