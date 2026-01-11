import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const POI_TYPES = ['PWH', 'PWL', 'PMH', 'PML', 'PQH', 'PQL'];

const derivePoiPrice = (basePrice, type, high24h, low24h) => {
  const range = high24h - low24h;
  
  switch (type) {
    case 'PWH': return basePrice + (range * 0.3); // Weekly high
    case 'PWL': return basePrice - (range * 0.3); // Weekly low
    case 'PMH': return basePrice + (range * 0.5); // Monthly high
    case 'PML': return basePrice - (range * 0.5); // Monthly low
    case 'PQH': return basePrice + (range * 0.7); // Quarterly high
    case 'PQL': return basePrice - (range * 0.7); // Quarterly low
    default: return basePrice;
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { symbols, prices } = await req.json();

    if (!symbols || !prices) {
      return Response.json({ error: 'Missing symbols or prices' }, { status: 400 });
    }

    const poisToCreate = [];

    for (const symbol of symbols) {
      const priceData = prices[symbol];
      if (!priceData) continue;

      for (const poiType of POI_TYPES) {
        const derivedPrice = derivePoiPrice(
          priceData.price,
          poiType,
          priceData.high24h,
          priceData.low24h
        );

        poisToCreate.push({
          symbol,
          poi_type: poiType,
          price: derivedPrice,
          status: 'active',
          derived_from: 'historical_24h_range',
          last_update_date: new Date().toISOString()
        });
      }
    }

    // Delete existing POIs for these symbols
    const existingPOIs = await base44.asServiceRole.entities.TrackedPOI.filter({});
    const symbolsToDelete = new Set(symbols);
    for (const poi of existingPOIs) {
      if (symbolsToDelete.has(poi.symbol)) {
        await base44.asServiceRole.entities.TrackedPOI.delete(poi.id);
      }
    }

    // Create new POIs
    if (poisToCreate.length > 0) {
      await base44.asServiceRole.entities.TrackedPOI.bulkCreate(poisToCreate);
    }

    return Response.json({ 
      success: true, 
      poisCreated: poisToCreate.length 
    });
  } catch (error) {
    console.error('Error initializing POIs:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});