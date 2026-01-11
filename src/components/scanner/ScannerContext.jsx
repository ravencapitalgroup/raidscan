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

// Fetch prices from Binance
const fetchPrices = async (symbols) => {
  const symbolList = symbols.map(s => s.replace('USDT', '')).join(', ');
  
  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `Get the current live Binance PERPETUAL FUTURES prices (NOT spot prices) and 24h price change percentages for these trading pairs: ${symbolList}/USDT. Make sure to use Binance Futures/Perpetuals data. Return ONLY the data, no explanations.`,
    add_context_from_internet: true,
    response_json_schema: {
      type: "object",
      properties: {
        prices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              symbol: { type: "string", description: "Symbol with USDT suffix, e.g. BTCUSDT" },
              price: { type: "number" },
              change24h: { type: "number", description: "24h percentage change" }
            }
          }
        }
      }
    }
  });
  
  return result.prices.reduce((acc, item) => {
    acc[item.symbol] = {
      price: item.price,
      change24h: item.change24h
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
      
      const newAssetData = {};
      const newRaids = [];
      
      for (const symbol of symbols) {
        if (prices[symbol]) {
          const pois = calculatePOIs(symbol, prices[symbol].price);
          
          Object.entries(pois).forEach(([poiType, data]) => {
            if (data.isActive) {
              const isHighRaid = poiType.includes('H');
              newRaids.push({
                symbol,
                poi_type: poiType,
                raid_direction: isHighRaid ? 'bearish' : 'bullish',
                poi_price: data.price,
                raid_price: prices[symbol].price,
                timestamp: new Date().toISOString()
              });
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