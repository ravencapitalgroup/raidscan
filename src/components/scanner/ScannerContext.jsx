import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const ScannerContext = createContext();

// Fetch POI values from database for a symbol
const fetchPOIsFromDatabase = async (symbol) => {
  const pois = await base44.entities.POIHistory.filter({ symbol, status: 'active' });
  
  const result = {};
  pois.forEach(poi => {
    result[poi.poi_type] = {
      price: poi.price,
      isActive: true
    };
  });
  
  return result;
};

// Fetch prices and market data from Binance
const fetchBinanceData = async (symbols) => {
  const response = await base44.functions.invoke('fetchBinanceData', { symbols });
  return response.data;
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
      const binanceData = await fetchBinanceData(symbols);

      const newAssetData = {};
      const newRaids = [];

      for (const symbol of symbols) {
        if (binanceData[symbol] && !binanceData[symbol].error) {
          const data = binanceData[symbol];
          const pois = await fetchPOIsFromDatabase(symbol);

          Object.entries(pois).forEach(([poiType, poiData]) => {
            const currentPrice = data.price;
            const poiPrice = poiData.price;
            const isHighPOI = poiType.includes('H');

            // Check if price breaches the POI
            let raidDirection = null;
            if (isHighPOI && currentPrice > poiPrice) {
              raidDirection = 'bullish';
            } else if (!isHighPOI && currentPrice < poiPrice) {
              raidDirection = 'bearish';
            }

            if (raidDirection) {
              newRaids.push({
                symbol,
                poi_type: poiType,
                raid_direction: raidDirection,
                poi_price: poiPrice,
                raid_price: currentPrice,
                timestamp: new Date().toISOString()
              });
            }
          });

          newAssetData[symbol] = {
            price: data.price,
            change24h: data.change24h,
            volume24h: data.volume24h,
            quoteAssetVolume: data.quoteAssetVolume,
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
        setError('Failed to fetch market data. Will retry automatically.');
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