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

        // Calculate quarterly data from past 3 calendar months
        let quarterlyRecordsCreated = 0;
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();

        // Get the last 3 calendar months
        const monthsForQuarterly = [];
        for (let i = 0; i < 3; i++) {
        const monthDate = new Date(currentYear, currentMonth - i, 1);
        monthsForQuarterly.push({
        year: monthDate.getFullYear(),
        month: monthDate.getMonth()
        });
        }

        // Delete existing quarterly records
        const existingQuarterly = await base44.asServiceRole.entities.PoiData.filter({ timeframe: '1q' });
        for (const record of existingQuarterly) {
        await base44.asServiceRole.entities.PoiData.delete(record.id);
        }

        // Calculate quarterly POI for each symbol
        for (const [symbol, poiData] of Object.entries(poiBySymbol)) {
        // Get all monthly data for this symbol
        const monthlyDataForSymbol = poiData.monthly;

        // Filter data from the last 3 calendar months
        const quarterlyData = monthlyDataForSymbol.filter(poi => {
        const poiDate = new Date(poi.timestamp);
        return monthsForQuarterly.some(m => 
          poiDate.getFullYear() === m.year && poiDate.getMonth() === m.month
        );
        });

        if (quarterlyData.length > 0) {
        // Calculate high and low from the 3 months of data
        const quarterlyHigh = Math.max(...quarterlyData.map(d => d.high));
        const quarterlyLow = Math.min(...quarterlyData.map(d => d.low));
        const quarterlyOpen = quarterlyData[0]?.open || 0;
        const quarterlyClose = quarterlyData[quarterlyData.length - 1]?.close || 0;
        const quarterlyVolume = quarterlyData.reduce((sum, d) => sum + d.volume, 0);
        const quarterlyQuoteVolume = quarterlyData.reduce((sum, d) => sum + d.quoteAssetVolume, 0);

        // Create timestamp for start of the current quarter
        const quarterStartDate = new Date(currentYear, Math.floor(currentMonth / 3) * 3, 1);
        const quarterTimestamp = quarterStartDate.getTime();

        try {
          await base44.asServiceRole.entities.PoiData.create({
            symbol,
            timeframe: '1q',
            timestamp: quarterTimestamp,
            open: quarterlyOpen,
            high: quarterlyHigh,
            low: quarterlyLow,
            close: quarterlyClose,
            volume: quarterlyVolume,
            quoteAssetVolume: quarterlyQuoteVolume,
            numberOfTrades: 0,
            takerBuyBaseAssetVolume: 0,
            takerBuyQuoteAssetVolume: 0
          });
          quarterlyRecordsCreated++;
          console.log(`Created quarterly POI for ${symbol}: High=${quarterlyHigh}, Low=${quarterlyLow}`);
        } catch (err) {
          console.error(`Failed to create quarterly POI for ${symbol}:`, err.message);
        }
        }
        }

        console.log(`Created ${quarterlyRecordsCreated} quarterly POI records`);

    // Sort all POI data by timestamp (earliest to oldest)
    const allPoiDataFinal = await base44.asServiceRole.entities.PoiData.list();
    const sortedBySymbol = {};
    
    allPoiDataFinal.forEach(poi => {
      if (!sortedBySymbol[poi.symbol]) {
        sortedBySymbol[poi.symbol] = [];
      }
      sortedBySymbol[poi.symbol].push(poi);
    });

    // Sort each symbol's data by timestamp ascending (earliest first)
    for (const symbol in sortedBySymbol) {
      sortedBySymbol[symbol].sort((a, b) => a.timestamp - b.timestamp);
    }

    console.log(`Sorted POI data by timestamp for ${Object.keys(sortedBySymbol).length} symbols`);

    return Response.json({
      success: true,
      recordsDeleted,
      quarterlyRecordsCreated,
      sortedSymbols: Object.keys(sortedBySymbol).length,
      message: `Successfully processed POI data: deleted ${recordsDeleted} old records, created ${quarterlyRecordsCreated} quarterly records, sorted ${Object.keys(sortedBySymbol).length} symbols by timestamp`
    });
  } catch (error) {
    console.error('POI update error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});