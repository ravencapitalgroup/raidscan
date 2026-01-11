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
            prompt: `Categorize these cryptocurrency symbols into their blockchain/asset type. For each symbol, provide one of: Layer 1 blockchain, Layer 2 solution, DeFi protocol, AI/ML token, Gaming/Metaverse, Meme coin, Infrastructure, or Other. Be concise and accurate.
            
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