import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('Starting asset data population...');

    // Fetch all assets with missing category (null, undefined, or 'Other')
    const allAssets = await base44.asServiceRole.entities.WatchlistAsset.list();
    const assetsNeedingCategory = allAssets.filter(a => !a.category || a.category === 'Other' || a.category === '');

    console.log(`Found ${assetsNeedingCategory.length} assets needing category`);

    let categoriesPopulated = 0;

    // Populate categories in batches
    if (assetsNeedingCategory.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < assetsNeedingCategory.length; i += batchSize) {
        const batch = assetsNeedingCategory.slice(i, i + batchSize);
        const symbolNames = batch.map(a => a.symbol.replace('USDT', ''));

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

        Symbols: ${symbolNames.join(', ')}`,
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

          for (const asset of batch) {
            const cleanSymbol = asset.symbol.replace('USDT', '');
            const category = result.categories?.[cleanSymbol] || 'Other';
            try {
              await base44.asServiceRole.entities.WatchlistAsset.update(asset.id, { category });
              categoriesPopulated++;
            } catch (updateErr) {
              console.warn(`Failed to update ${asset.symbol}: ${updateErr.message}`);
            }
          }

          console.log(`Populated categories for ${Math.min(batchSize, assetsNeedingCategory.length - i)} assets`);
          await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
          console.error(`Error populating types in batch: ${err.message}`);
        }
      }
    }

    return Response.json({
      success: true,
      categoriesPopulated,
      message: `Populated ${categoriesPopulated} asset categories`
    });
  } catch (error) {
    console.error('populateAssetData error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});