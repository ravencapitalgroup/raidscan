import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Helper to categorize symbols using AI
const categorizeSymbols = async (base44, symbols) => {
  if (symbols.length === 0) return {};
  
  try {
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Categorize these cryptocurrency symbols into their blockchain/asset type. Use ONLY these categories:
    - Layer 1: Base blockchain networks (e.g., Ethereum, Solana, Bitcoin, Cardano, Polkadot)
    - Layer 2: Scalability solutions built on Layer 1s (e.g., Polygon, Arbitrum, Optimism, Starkware)
    - DeFi: Decentralized Finance protocols (e.g., Aave, Uniswap, Curve, Lido, MakerDAO)
    - AI: Projects integrating AI/ML technologies (e.g., Render, Fetch.ai, Chainlink, Injective)
    - Gaming: Blockchain games or metaverse projects (e.g., Axie Infinity, Decentraland, The Sandbox, Gala)
    - Meme: Internet culture-driven coins (e.g., Dogecoin, Shiba Inu, Floki)
    - Infrastructure: Fundamental crypto ecosystem tools (e.g., Chainlink, The Graph, Uniswap, Compound)
    - Other: Only if no category truly fits

    Prioritize accuracy. Use 'Other' as a last resort. For each symbol, provide one category.

    Symbols: ${symbols.join(', ')}`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          categories: {
            type: "object",
            additionalProperties: { type: "string" }
          }
        }
      }
    });
    
    return result.categories || {};
  } catch (err) {
    console.error('Error categorizing symbols:', err.message);
    return {};
  }
};

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

    // Get existing Binance symbols
    const existingAssets = await base44.asServiceRole.entities.WatchlistAsset.filter({ source: 'binance' });
    const existingMap = new Map(existingAssets.map(a => [`${a.symbol}-${a.is_futures}`, a]));

    // Find new symbols to add
    const newSymbols = allBinanceSymbols.filter(s => !existingMap.has(`${s.symbol}-${s.is_futures}`));
    console.log(`New symbols to add: ${newSymbols.length}`);

    if (newSymbols.length > 0) {
      // Categorize new symbols using AI
      const symbolNames = newSymbols.map(s => s.symbol.replace('USDT', ''));
      const types = await categorizeSymbols(base44, symbolNames);
      
      // Bulk create new assets
      const assetsToCreate = newSymbols.map(s => ({
        symbol: s.symbol,
        source: 'binance',
        is_active: true,
        category: types[s.symbol.replace('USDT', '')] || 'Other',
        is_futures: s.is_futures,
        is_spot: s.is_spot
      }));

      const batchSize = 100;
      for (let i = 0; i < assetsToCreate.length; i += batchSize) {
        const batch = assetsToCreate.slice(i, i + batchSize);
        await base44.asServiceRole.entities.WatchlistAsset.bulkCreate(batch);
        console.log(`Created ${batch.length} assets`);
        if (i + batchSize < assetsToCreate.length) {
          await delay(500);
        }
      }
    }

    // Update existing symbols with new futures/spot status
    for (const asset of existingAssets) {
      const updated = allBinanceSymbols.find(s => s.symbol === asset.symbol && s.is_futures === asset.is_futures);
      if (updated && (asset.is_spot !== updated.is_spot)) {
        await base44.asServiceRole.entities.WatchlistAsset.update(asset.id, {
          is_spot: updated.is_spot
        });
      }
    }

    // Mark symbols no longer on exchange as inactive
    const currentSymbolSet = new Set(allBinanceSymbols.map(s => `${s.symbol}-${s.is_futures}`));
    for (const asset of existingAssets) {
      if (!currentSymbolSet.has(`${asset.symbol}-${asset.is_futures}`) && asset.is_active) {
        await base44.asServiceRole.entities.WatchlistAsset.update(asset.id, { is_active: false });
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