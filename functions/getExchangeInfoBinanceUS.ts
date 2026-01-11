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

    // Get existing Binance US symbols
    const existingAssets = await base44.asServiceRole.entities.WatchlistAsset.filter({ source: 'binanceus' });
    const existingSymbols = new Set(existingAssets.map(a => a.symbol));

    // Find new symbols to add
    const newSymbols = usSpotSymbols.filter(s => !existingSymbols.has(s.symbol));
    console.log(`New symbols to add: ${newSymbols.length}`);

    if (newSymbols.length > 0) {
      // Categorize new symbols using AI
      const symbolNames = newSymbols.map(s => s.symbol.replace('USDT', ''));
      const types = await categorizeSymbols(base44, symbolNames);
      
      // Bulk create new assets
      const assetsToCreate = newSymbols.map(s => ({
        symbol: s.symbol,
        source: 'binanceus',
        is_active: true,
        category: types[s.symbol.replace('USDT', '')] || 'Other',
        is_futures: false,
        is_spot: true
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

    // Mark symbols no longer on exchange as inactive
    const currentSymbolSet = new Set(usSpotSymbols.map(s => s.symbol));
    for (const asset of existingAssets) {
      if (!currentSymbolSet.has(asset.symbol) && asset.is_active) {
        await base44.asServiceRole.entities.WatchlistAsset.update(asset.id, { is_active: false });
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