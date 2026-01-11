import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const ScannerContext = createContext();



// Normalize symbol to Binance format (e.g., BTC -> BTCUSDT)
const normalizeSymbol = (symbol) => {
  if (!symbol.endsWith('USDT')) {
    return symbol + 'USDT';
  }
  return symbol;
};

// Fetch prices from Binance via backend function with retry logic
const fetchPrices = async (symbols, retries = 3) => {
  const normalizedSymbols = symbols.map(normalizeSymbol);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const [binanceResult, binanceUSResult] = await Promise.all([
        Promise.race([
          base44.functions.invoke('fetchPricesBinance', { symbols: normalizedSymbols }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Binance request timeout')), 10000))
        ]),
        Promise.race([
          base44.functions.invoke('fetchPricesBinanceUS', { symbols: normalizedSymbols }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Binance US request timeout')), 10000))
        ])
      ]);
      
      clearTimeout(timeoutId);
      console.log('Raw result from fetchBinancePricesBinance:', binanceResult);
      console.log('Raw result from fetchBinancePricesBinanceUS:', binanceUSResult);

      const combinedPrices = [
        ...(binanceResult?.data?.prices || []),
        ...(binanceUSResult?.data?.prices || [])
      ];

      if (combinedPrices.length === 0) {
        console.error('No prices returned from either Binance or Binance US');
        if (attempt === retries) {
          return {};
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
        continue;
      }

      return combinedPrices.reduce((acc, item) => {
        if (item.error) {
          console.error(`Error fetching ${item.symbol}:`, item.error);
          return acc;
        }
        acc[item.symbol] = {
          price: item.lastPrice,
          change24h: item.priceChangePercent,
          volume: item.volume,
          quoteAssetVolume: item.quoteAssetVolume
        };
        return acc;
      }, {});
    } catch (err) {
      console.warn(`Fetch attempt ${attempt}/${retries} failed:`, err.message);
      if (attempt === retries) {
        console.error('All fetch attempts failed:', err);
        return {}; // Return empty object on final failure
      }
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }
  
  return {};
};

export function ScannerProvider({ children }) {
  const [isScanning, setIsScanning] = useState(false);
  const [assetData, setAssetData] = useState({});
  const [refreshInterval, setRefreshInterval] = useState(300000);
  const [nextRefresh, setNextRefresh] = useState(null);
  const [error, setError] = useState(null);
  const [timezone, setTimezone] = useState('UTC');

  const { data: binanceAssets = [] } = useQuery({
    queryKey: ['watchlistAssetsBinance'],
    queryFn: () => base44.entities.WatchlistAssetBinance.filter({ is_active: true }),
  });

  const { data: binanceUSAssets = [] } = useQuery({
    queryKey: ['watchlistAssetsBinanceUS'],
    queryFn: () => base44.entities.WatchlistAssetBinanceUS.filter({ is_active: true }),
  });

  const watchlistAssets = [...binanceAssets, ...binanceUSAssets].reduce((acc, asset) => {
    const existing = acc.find(a => a.symbol === asset.symbol);
    if (!existing) {
      acc.push(asset);
    } else if (new Date(asset.created_date) > new Date(existing.created_date)) {
      const index = acc.indexOf(existing);
      acc[index] = asset;
    }
    return acc;
  }, []);

  const symbols = watchlistAssets.map(a => a.symbol);

  const scanMarkets = async () => {
    if (symbols.length === 0) return;

    setIsScanning(true);
    setError(null);

    try {
          console.log('Scanning markets...');
          console.log('Watchlist symbols:', symbols);
          const prices = await fetchPrices(symbols, 3);
      console.log('Fetched prices:', prices);

      // Fetch PoiData from both Binance and Binance US
      const binancePoiData = await base44.entities.PoiDataBinance.list();
      const binanceUSPoiData = await base44.entities.PoiDataBinanceUS.list();
      const allPoiData = [...binancePoiData, ...binanceUSPoiData];
      console.log('Fetched PoiData (' + allPoiData.length + ' total records)');

      const newAssetData = {};
      const newRaids = [];

      for (const symbol of symbols) {
        const normalizedSymbol = normalizeSymbol(symbol);
        // Try normalized symbol first, then try without USDT as fallback
        const priceKey = prices[normalizedSymbol] ? normalizedSymbol : normalizedSymbol.replace('USDT', '');
        if (prices[priceKey]) {
          // Get PoiData for this symbol from database
          const weeklyData = allPoiData.find(poi => poi.symbol === normalizedSymbol && poi.timeframe === '1w');
          const monthlyData = allPoiData.find(poi => poi.symbol === normalizedSymbol && poi.timeframe === '1M');
          const quarterlyData = allPoiData.find(poi => poi.symbol === normalizedSymbol && poi.timeframe === '1q');

          // Build pois from database data
          const pois = {
            PWH: weeklyData ? { price: weeklyData.high, isRaided: false, isActive: true } : { price: 0, isRaided: false, isActive: false },
            PWL: weeklyData ? { price: weeklyData.low, isRaided: false, isActive: true } : { price: 0, isRaided: false, isActive: false },
            PMH: monthlyData ? { price: monthlyData.high, isRaided: false, isActive: true } : { price: 0, isRaided: false, isActive: false },
            PML: monthlyData ? { price: monthlyData.low, isRaided: false, isActive: true } : { price: 0, isRaided: false, isActive: false },
            PQH: quarterlyData ? { price: quarterlyData.high, isRaided: false, isActive: true } : { price: 0, isRaided: false, isActive: false },
            PQL: quarterlyData ? { price: quarterlyData.low, isRaided: false, isActive: true } : { price: 0, isRaided: false, isActive: false }
          };

          Object.entries(pois).forEach(([poiType, data]) => {
            if (data.isActive && data.price > 0) {
              const isHighRaid = poiType.includes('H');
              const distancePercent = Math.abs((prices[priceKey].price - data.price) / data.price) * 100;

              // Only flag as raid if price is within 2% of POI
              if (distancePercent < 2) {
                newRaids.push({
                  symbol: normalizedSymbol,
                  poi_type: poiType,
                  raid_direction: isHighRaid ? 'bullish' : 'bearish',
                  poi_price: data.price,
                  raid_price: prices[normalizedSymbol].price,
                  timestamp: new Date().toISOString()
                });
              }
            }
          });

          newAssetData[normalizedSymbol] = {
            ...prices[priceKey],
            pois,
            activeRaids: newRaids.filter(r => r.symbol === normalizedSymbol)
          };
        }
      }
      
      console.log('AssetData populated:', newAssetData);
      setAssetData(newAssetData);
    } catch (err) {
      console.error('Scan error:', err);
      const errorMessage = err.message || err.toString();
      
      if (errorMessage.includes('Rate limit')) {
        setError('Rate limit reached. Please wait before refreshing again.');
      } else if (errorMessage.includes('502')) {
        setError('Server temporarily unavailable. Will retry automatically.');
      } else {
        setError('Failed to fetch prices. Will retry automatically.');
      }
    } finally {
      setIsScanning(false);
      setNextRefresh(Date.now() + refreshInterval);
    }
  };

  useEffect(() => {
    if (symbols.length === 0) {
      setIsScanning(false);
      return;
    }
    
    scanMarkets();
    setNextRefresh(Date.now() + refreshInterval);
    
    const interval = setInterval(() => {
      scanMarkets();
      setNextRefresh(Date.now() + refreshInterval);
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [symbols.join(','), refreshInterval]);
  


  const value = {
    isScanning,
    assetData,
    symbols,
    refreshInterval,
    setRefreshInterval,
    nextRefresh,
    error,
    scanMarkets,
    timezone,
    setTimezone
  };

  return (
    <ScannerContext.Provider value={value}>
      {children}
    </ScannerContext.Provider>
  );
}

export function useScannerData() {
  const context = useContext(ScannerContext);
  if (!context) {
    throw new Error('useScannerData must be used within ScannerProvider');
  }
  return context;
}