import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ScannerHeader from '@/components/scanner/ScannerHeader';
import AssetCard from '@/components/scanner/AssetCard';
import RaidAlertFeed from '@/components/scanner/RaidAlertFeed';
import StatsBar from '@/components/scanner/StatsBar';
import SymbolManager from '@/components/scanner/SymbolManager';
import { Input } from "@/components/ui/input";
import { Search, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const REFRESH_INTERVALS = [
  { label: '5 Minutes', value: 300000, shortLabel: '5m' },
  { label: '30 Minutes', value: 1800000, shortLabel: '30m' },
  { label: '1 Hour', value: 3600000, shortLabel: '1h' },
];

// Simulated POI calculation (in production, this would fetch real data)
const calculatePOIs = (symbol, currentPrice) => {
  // Simulate POI levels based on current price with some variance
  const variance = currentPrice * 0.05;
  const weeklyVariance = currentPrice * 0.08;
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

// Fetch current perpetual futures prices directly from Binance
const fetchPrices = async (symbols) => {
  try {
    // Fetch all ticker data from Binance Futures API
    const response = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
    const allTickers = await response.json();
    
    // Filter and map to our symbols
    const pricesMap = {};
    for (const symbol of symbols) {
      const ticker = allTickers.find(t => t.symbol === symbol);
      if (ticker) {
        pricesMap[symbol] = {
          price: parseFloat(ticker.lastPrice),
          change24h: parseFloat(ticker.priceChangePercent)
        };
      }
    }
    
    return pricesMap;
  } catch (error) {
    console.error('Error fetching prices:', error);
    throw error;
  }
};

export default function Scanner() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isScanning, setIsScanning] = useState(false);
  const [assetData, setAssetData] = useState({});
  const [refreshInterval, setRefreshInterval] = useState(300000); // Default 5 minutes
  const [nextRefresh, setNextRefresh] = useState(null);
  const [error, setError] = useState(null);
  const queryClient = useQueryClient();

  // Fetch active symbols from database
  const { data: rawWatchlistAssets = [] } = useQuery({
    queryKey: ['watchlistAssets'],
    queryFn: () => base44.entities.WatchlistAsset.filter({ is_active: true }),
  });

  // Remove duplicates - keep only the most recently created one for each symbol
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

  // Fetch saved alerts
  const { data: alerts = [] } = useQuery({
    queryKey: ['raidAlerts'],
    queryFn: () => base44.entities.RaidAlert.list('-created_date', 50),
  });

  // Mutation for creating alerts
  const createAlert = useMutation({
    mutationFn: (alertData) => base44.entities.RaidAlert.create(alertData),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['raidAlerts'] }),
  });

  // Mutation for dismissing alerts
  const dismissAlert = useMutation({
    mutationFn: (id) => base44.entities.RaidAlert.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['raidAlerts'] }),
  });

  // Scan for prices and POIs
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
          
          // Check for active raids and create alerts
          Object.entries(pois).forEach(([poiType, data]) => {
            if (data.isActive) {
              const isHighRaid = poiType.includes('H');
              newRaids.push({
                symbol,
                poi_type: poiType,
                raid_direction: isHighRaid ? 'bearish' : 'bullish',
                poi_price: data.price,
                raid_price: prices[symbol].price,
                timestamp: new Date().toLocaleTimeString()
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

  // Initial scan and periodic refresh
  useEffect(() => {
    if (symbols.length === 0) {
      setIsScanning(false);
      setAssetData({});
      return;
    }
    
    // Initial scan
    scanMarkets();
    setNextRefresh(Date.now() + refreshInterval);
    
    // Set up periodic refresh based on selected interval
    const interval = setInterval(() => {
      scanMarkets();
      setNextRefresh(Date.now() + refreshInterval);
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [symbols.length, refreshInterval]);
  
  // Update countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setNextRefresh(prev => prev ? prev : Date.now() + refreshInterval);
    }, 1000);
    return () => clearInterval(timer);
  }, [refreshInterval]);

  // Filter assets
  const filteredSymbols = symbols.filter(symbol => {
    const matchesSearch = symbol.toLowerCase().includes(searchQuery.toLowerCase());
    if (filterType === 'all') return matchesSearch;
    if (filterType === 'raids') return matchesSearch && assetData[symbol]?.activeRaids?.length > 0;
    return matchesSearch;
  });

  // Calculate stats
  const stats = {
    pwhRaids: alerts.filter(a => a.poi_type === 'PWH').length,
    pwlRaids: alerts.filter(a => a.poi_type === 'PWL').length,
    pqhRaids: alerts.filter(a => a.poi_type === 'PQH').length,
    pqlRaids: alerts.filter(a => a.poi_type === 'PQL').length,
  };

  const totalActiveRaids = Object.values(assetData).reduce(
    (sum, data) => sum + (data.activeRaids?.length || 0), 0
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <SymbolManager />
      
      {/* Background pattern */}
      <div className="fixed inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDI5M2EiIGZpbGwtb3BhY2l0eT0iMC4zIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0tNiA2aC0ydi00aDJ2NHptMC02aC0ydi00aDJ2NHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30 pointer-events-none" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ScannerHeader
          totalAssets={symbols.length}
          activeRaids={totalActiveRaids}
          isScanning={isScanning}
          onRefresh={() => {
            scanMarkets();
            setNextRefresh(Date.now() + refreshInterval);
          }}
          refreshInterval={refreshInterval}
          onRefreshIntervalChange={setRefreshInterval}
          nextRefresh={nextRefresh}
        />
        
        <StatsBar stats={stats} />
        
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
            ⚠️ {error}
          </div>
        )}
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-amber-500/50"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-48 bg-slate-900/50 border-slate-700 text-white">
              <Filter className="w-4 h-4 mr-2 text-slate-500" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all">All Assets</SelectItem>
              <SelectItem value="raids">Active Raids Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Asset Grid */}
          <div className="lg:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredSymbols.map(symbol => (
                <AssetCard
                  key={symbol}
                  symbol={symbol}
                  price={assetData[symbol]?.price}
                  change24h={assetData[symbol]?.change24h || 0}
                  pois={assetData[symbol]?.pois}
                  activeRaids={assetData[symbol]?.activeRaids}
                  isLoading={!assetData[symbol]}
                />
              ))}
            </div>
          </div>
          
          {/* Alert Feed */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <RaidAlertFeed 
                alerts={alerts.filter(a => a.status === 'active')}
                onDismiss={(id) => dismissAlert.mutate(id)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}