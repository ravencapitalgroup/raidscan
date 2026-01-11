import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const timezone = user.timezone || 'UTC';
    
    // Get all POI data
    const allPoiData = await base44.asServiceRole.entities.PoiData.list();
    
    // Group by symbol
    const poiBySymbol = {};
    allPoiData.forEach(poi => {
      if (!poiBySymbol[poi.symbol]) {
        poiBySymbol[poi.symbol] = { weekly: [], monthly: [], quarterly: [] };
      }
      if (poi.timeframe === '1w') {
        poiBySymbol[poi.symbol].weekly.push(poi);
      } else if (poi.timeframe === '1M') {
        poiBySymbol[poi.symbol].monthly.push(poi);
      }
    });

    // Calculate retention dates based on current time
    const now = new Date();
    const nineWeeksAgo = new Date(now.getTime() - 9 * 7 * 24 * 60 * 60 * 1000);
    const sevenMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 7, now.getDate());
    const twoQuartersAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());

    const recordsToDelete = [];
    let recordsDeleted = 0;

    // Process each symbol
    for (const [symbol, poiData] of Object.entries(poiBySymbol)) {
      // Clean up weekly data - keep only last 9 weeks
      poiData.weekly.forEach(poi => {
        const poiDate = new Date(poi.timestamp);
        if (poiDate < nineWeeksAgo) {
          recordsToDelete.push(poi.id);
        }
      });

      // Clean up monthly data - keep only last 7 months
      poiData.monthly.forEach(poi => {
        const poiDate = new Date(poi.timestamp);
        if (poiDate < sevenMonthsAgo) {
          recordsToDelete.push(poi.id);
        }
      });
    }

    // Delete old records in batches
    if (recordsToDelete.length > 0) {
      for (let i = 0; i < recordsToDelete.length; i += 50) {
        const batch = recordsToDelete.slice(i, i + 50);
        for (const id of batch) {
          try {
            await base44.asServiceRole.entities.PoiData.delete(id);
            recordsDeleted++;
          } catch (err) {
            console.error(`Failed to delete POI record ${id}:`, err.message);
          }
        }
      }
    }

    console.log(`Deleted ${recordsDeleted} old POI records`);

    return Response.json({
      success: true,
      recordsDeleted,
      message: `Successfully processed POI data: deleted ${recordsDeleted} old records`
    });
  } catch (error) {
    console.error('POI update error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});