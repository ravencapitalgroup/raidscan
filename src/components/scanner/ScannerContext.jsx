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

// Fetch prices from Binance via backend function
const fetchPrices = async (symbols) => {
  const result = await base44.functions.invoke('fetchBinancePrices', { symbols });
  
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
        if (prices[symbol]) {
          // Get PoiData for this symbol from database
          const symbolPoiData = allPoiData.filter(poi => poi.symbol === symbol);
          
          // Build pois object from database or fallback to calculated
          const pois = {};
          if (symbolPoiData.length > 0) {
            const poiTypes = ['PWH', 'PWL', 'PMH', 'PML', 'PQH', 'PQL'];
            poiTypes.forEach(type => {
              const poiRecord = symbolPoiData.find(p => {
                // Check if this POI matches the type
                if (type === 'PWH' || type === 'PWL') return p.timeframe === '1w';
                if (type === 'PMH' || type === 'PML') return p.timeframe === '1M';
                return false;
              });
              
              if (poiRecord) {
                pois[type] = {
                  price: type.includes('H') ? poiRecord.high : poiRecord.low,
                  isRaided: false,
                  isActive: true
                };
              } else {
                pois[type] = {
                  price: 0,
                  isRaided: false,
                  isActive: false
                };
              }
            });
          } else {
            // Fallback to calculated POIs if no database records
            const calculated = calculatePOIs(symbol, prices[symbol].price);
            Object.assign(pois, calculated);
          }
          
          Object.entries(pois).forEach(([poiType, data]) => {
            if (data.isActive && data.price > 0) {
              const isHighRaid = poiType.includes('H');
              const distancePercent = Math.abs((prices[symbol].price - data.price) / data.price) * 100;
              
              // Only flag as raid if price is within 2% of POI
              if (distancePercent < 2) {
                newRaids.push({
                  symbol,
                  poi_type: poiType,
                  raid_direction: isHighRaid ? 'bullish' : 'bearish',
                  poi_price: data.price,
                  raid_price: prices[symbol].price,
                  timestamp: new Date().toISOString()
                });
              }
            }
          });
          
          newAssetData[symbol] = {
            ...prices[symbol],
            pois,
            activeRaids: newRaids.filter(r => r.symbol === symbol)
          };
        }
      }
      
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