import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const ScannerContext = createContext();

// Simulated POI calculation
const calculatePOIs = (symbol, currentPrice) => {
  const variance = currentPrice * 0.05;
  const weeklyVariance = currentPrice * 0.08;
  const monthlyVariance = currentPrice * 0.12;
  const quarterlyVariance = currentPrice * 0.15;
  
  return {
    PWH: { 
      price: currentPrice + weeklyVariance * (0.5 + Math.random() * 0.5),
      isRaided: Math.random() > 0.85,
      isActive: Math.random() > 0.9
    },
    PWL: { 
      price: currentPrice - weeklyVariance * (0.5 + Math.random() * 0.5),
      isRaided: Math.random() > 0.85,
      isActive: Math.random() > 0.9
    },
    PMH: { 
      price: currentPrice + monthlyVariance * (0.5 + Math.random() * 0.5),
      isRaided: Math.random() > 0.88,
      isActive: Math.random() > 0.92
    },
    PML: { 
      price: currentPrice - monthlyVariance * (0.5 + Math.random() * 0.5),
      isRaided: Math.random() > 0.88,
      isActive: Math.random() > 0.92
    },
    PQH: { 
      price: currentPrice + quarterlyVariance * (0.5 + Math.random() * 0.5),
      isRaided: Math.random() > 0.92,
      isActive: Math.random() > 0.95
    },
    PQL: { 
      price: currentPrice - quarterlyVariance * (0.5 + Math.random() * 0.5),
      isRaided: Math.random() > 0.92,
      isActive: Math.random() > 0.95
    },
  };
};

// Normalize symbol to Binance format (e.g., BTC -> BTCUSDT)
const normalizeSymbol = (symbol) => {
  if (!symbol.endsWith('USDT')) {
    return symbol + 'USDT';
  }
  return symbol;
};

// Fetch prices from Binance via backend function
const fetchPrices = async (symbols) => {
  const normalizedSymbols = symbols.map(normalizeSymbol);
  const result = await base44.functions.invoke('fetchBinancePrices', { symbols: normalizedSymbols });

  return result.prices.reduce((acc, item) => {
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
};

export function ScannerProvider({ children }) {
  const [isScanning, setIsScanning] = useState(false);
  const [assetData, setAssetData] = useState({});
  const [refreshInterval, setRefreshInterval] = useState(300000);
  const [nextRefresh, setNextRefresh] = useState(null);
  const [error, setError] = useState(null);
  const [timezone, setTimezone] = useState('UTC');

  const { data: rawWatchlistAssets = [] } = useQuery({
    queryKey: ['watchlistAssets'],
    queryFn: () => base44.entities.WatchlistAsset.filter({ is_active: true }),
  });

  const watchlistAssets = rawWatchlistAssets.reduce((acc, asset) => {
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
      const prices = await fetchPrices(symbols);

      // Fetch PoiData from database for all symbols
      const allPoiData = await base44.entities.PoiData.list();

      const newAssetData = {};
      const newRaids = [];

      for (const symbol of symbols) {
        const normalizedSymbol = normalizeSymbol(symbol);
        if (prices[normalizedSymbol]) {
          // Get PoiData for this symbol from database (normalize for lookup)
          const weeklyData = allPoiData.find(poi => poi.symbol === normalizedSymbol && poi.timeframe === '1w');
          const monthlyData = allPoiData.find(poi => poi.symbol === normalizedSymbol && poi.timeframe === '1M');
          
          // Build pois from database data
          const pois = {
            PWH: weeklyData ? { price: weeklyData.high, isRaided: false, isActive: true } : { price: 0, isRaided: false, isActive: false },
            PWL: weeklyData ? { price: weeklyData.low, isRaided: false, isActive: true } : { price: 0, isRaided: false, isActive: false },
            PMH: monthlyData ? { price: monthlyData.high, isRaided: false, isActive: true } : { price: 0, isRaided: false, isActive: false },
            PML: monthlyData ? { price: monthlyData.low, isRaided: false, isActive: true } : { price: 0, isRaided: false, isActive: false }
          };
          
          // Calculate quarterly POIs if not in database
          const calculated = calculatePOIs(symbol, prices[normalizedSymbol].price);
          pois.PQH = calculated.PQH;
          pois.PQL = calculated.PQL;

          Object.entries(pois).forEach(([poiType, data]) => {
            if (data.isActive && data.price > 0) {
              const isHighRaid = poiType.includes('H');
              const distancePercent = Math.abs((prices[normalizedSymbol].price - data.price) / data.price) * 100;

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

          newAssetData[symbol] = {
            ...prices[normalizedSymbol],
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