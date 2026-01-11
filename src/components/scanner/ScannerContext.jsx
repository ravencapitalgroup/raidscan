import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const ScannerContext = createContext();

// Fetch prices from Binance API
const fetchPrices = async (symbols) => {
  const response = await base44.functions.invoke('fetchCryptoData', { symbols });
  return response.data.prices;
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

  const { data: trackedPOIs = [] } = useQuery({
    queryKey: ['trackedPOIs'],
    queryFn: () => base44.entities.TrackedPOI.list(),
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
      
      const newAssetData = {};
      const newRaids = [];
      
      for (const symbol of symbols) {
        if (prices[symbol]) {
          const symbolPOIs = trackedPOIs.filter(p => p.symbol === symbol);
          const pois = {};
          const proximityThreshold = 0.01; // 1% proximity threshold

          symbolPOIs.forEach(poi => {
            const proximityPercent = Math.abs(prices[symbol].price - poi.price) / poi.price;
            const isRaided = proximityPercent <= proximityThreshold;

            pois[poi.poi_type] = {
              price: poi.price,
              isRaided,
              isActive: true
            };

            if (isRaided) {
              const isHighRaid = poi.poi_type.includes('H');
              newRaids.push({
                symbol,
                poi_type: poi.poi_type,
                raid_direction: isHighRaid ? 'bullish' : 'bearish',
                poi_price: poi.price,
                raid_price: prices[symbol].price,
                timestamp: new Date().toISOString()
              });

              // Update POI status in database
              base44.entities.TrackedPOI.update(poi.id, {
                status: 'raided',
                last_raid_date: new Date().toISOString()
              }).catch(err => console.error('Error updating POI:', err));
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