import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import moment from 'npm:moment@2.30.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const timezone = user.timezone || 'UTC';
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper function to process POI data for a given entity
    const processPoiEntity = async (entityName) => {
      console.log(`\n=== Processing ${entityName} ===`);

      const allPoiData = await base44.asServiceRole.entities[entityName].list();

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

      const now = moment();
      const nineWeeksAgo = now.clone().subtract(9, 'weeks').toDate();
      const sevenMonthsAgo = now.clone().subtract(7, 'months').toDate();

      const recordsToDelete = [];
      let recordsDeleted = 0;

      // Clean up old data
      for (const [symbol, poiData] of Object.entries(poiBySymbol)) {
        poiData.weekly.forEach(poi => {
          const poiDate = new Date(poi.timestamp);
          if (poiDate < nineWeeksAgo) {
            recordsToDelete.push(poi.id);
          }
        });

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
              await base44.asServiceRole.entities[entityName].delete(id);
              recordsDeleted++;
            } catch (err) {
              console.error(`Failed to delete record ${id}:`, err.message);
            }
          }
        }
      }

      console.log(`Deleted ${recordsDeleted} old records from ${entityName}`);

      // Calculate quarterly data
      let quarterlyRecordsCreated = 0;
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth();
      const currentYear = currentDate.getFullYear();

      const monthsForQuarterly = [];
      for (let i = 0; i < 3; i++) {
        const monthDate = new Date(currentYear, currentMonth - i, 1);
        monthsForQuarterly.push({
          year: monthDate.getFullYear(),
          month: monthDate.getMonth()
        });
      }

      // Delete existing quarterly records
      const existingQuarterly = await base44.asServiceRole.entities[entityName].filter({ timeframe: '1q' });
      for (const record of existingQuarterly) {
        await base44.asServiceRole.entities[entityName].delete(record.id);
      }

      // Calculate quarterly POI for each symbol
      for (const [symbol, poiData] of Object.entries(poiBySymbol)) {
        const monthlyDataForSymbol = poiData.monthly;

        const quarterlyData = monthlyDataForSymbol.filter(poi => {
          const poiDate = new Date(poi.timestamp);
          return monthsForQuarterly.some(m =>
            poiDate.getFullYear() === m.year && poiDate.getMonth() === m.month
          );
        });

        if (quarterlyData.length > 0) {
          const quarterlyHigh = Math.max(...quarterlyData.map(d => d.high));
          const quarterlyLow = Math.min(...quarterlyData.map(d => d.low));
          const quarterlyOpen = quarterlyData[0]?.open || 0;
          const quarterlyClose = quarterlyData[quarterlyData.length - 1]?.close || 0;
          const quarterlyVolume = quarterlyData.reduce((sum, d) => sum + d.volume, 0);
          const quarterlyQuoteVolume = quarterlyData.reduce((sum, d) => sum + d.quoteAssetVolume, 0);

          const quarterStartDate = new Date(currentYear, Math.floor(currentMonth / 3) * 3, 1);
          const quarterTimestamp = quarterStartDate.getTime();

          try {
            await base44.asServiceRole.entities[entityName].create({
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

      console.log(`Created ${quarterlyRecordsCreated} quarterly records for ${entityName}`);
      return { recordsDeleted, quarterlyRecordsCreated };
    };

    // Process both entities
    const binanceResults = await processPoiEntity('PoiDataBinance');
    await delay(500);
    const binanceUSResults = await processPoiEntity('PoiDataBinanceUS');

    return Response.json({
      success: true,
      binance: binanceResults,
      binanceUS: binanceUSResults,
      message: `Successfully processed POI data for both Binance and Binance US`
    });
  } catch (error) {
    console.error('POI update error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});