import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('Starting asset data population...');

    // Fetch all assets with missing type or market_cap_rank
    const allAssets = await base44.asServiceRole.entities.WatchlistAsset.list();
    const assetsNeedingType = allAssets.filter(a => !a.type);
    const assetsNeedingRank = allAssets.filter(a => !a.market_cap_rank);

    console.log(`Found ${assetsNeedingType.length} assets needing type`);
    console.log(`Found ${assetsNeedingRank.length} assets needing market cap rank`);

    let typesPopulated = 0;
    let ranksPopulated = 0;

    // Populate types in batches
    if (assetsNeedingType.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < assetsNeedingType.length; i += batchSize) {
        const batch = assetsNeedingType.slice(i, i + batchSize);
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
            const type = result.categories?.[cleanSymbol] || 'Other';
            await base44.asServiceRole.entities.WatchlistAsset.update(asset.id, { type });
            typesPopulated++;
          }

          console.log(`Populated types for ${Math.min(batchSize, assetsNeedingType.length - i)} assets`);
          await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
          console.error(`Error populating types in batch: ${err.message}`);
        }
      }
    }

    // Populate market cap ranks
    if (assetsNeedingRank.length > 0) {
      try {
        const symbolNames = assetsNeedingRank.map(a => a.symbol.replace('USDT', ''));
        
        const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Get the current market cap rank for these cryptocurrencies. Return an object mapping each symbol to its rank number. If you don't know the exact rank, provide your best estimate based on market cap data.
          
Symbols: ${symbolNames.join(', ')}`,
          add_context_from_internet: true,
          response_json_schema: {
            type: "object",
            properties: {
              ranks: {
                type: "object",
                additionalProperties: { type: "number" }
              }
            }
          }
        });

        for (const asset of assetsNeedingRank) {
          const cleanSymbol = asset.symbol.replace('USDT', '');
          const rank = result.ranks?.[cleanSymbol];
          if (rank) {
            await base44.asServiceRole.entities.WatchlistAsset.update(asset.id, { market_cap_rank: rank });
            ranksPopulated++;
          }
        }

        console.log(`Populated market cap ranks for ${ranksPopulated} assets`);
      } catch (err) {
        console.error(`Error populating ranks: ${err.message}`);
      }
    }

    return Response.json({
      success: true,
      typesPopulated,
      ranksPopulated,
      message: `Populated ${typesPopulated} types and ${ranksPopulated} market cap ranks`
    });
  } catch (error) {
    console.error('populateAssetData error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});