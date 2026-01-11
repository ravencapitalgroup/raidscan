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

// Fetch current perpetual futures prices from Binance using AI
const fetchPrices = async (symbols) => {
  try {
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
  const queryClient = useQueryClient();

  // Fetch active symbols from database
  const { data: watchlistAssets = [] } = useQuery({
    queryKey: ['watchlistAssets'],
    queryFn: () => base44.entities.WatchlistAsset.filter({ is_active: true }),
  });

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
  const scanMarkets = useCallback(async () => {
    if (symbols.length === 0) return;
    
    setIsScanning(true);
    
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
    setIsScanning(false);
  }, [symbols]);

  // Initial scan and periodic refresh
  useEffect(() => {
    if (symbols.length === 0) return;
    
    scanMarkets();
    setNextRefresh(Date.now() + refreshInterval);
    
    const interval = setInterval(() => {
      scanMarkets();
      setNextRefresh(Date.now() + refreshInterval);
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [symbols, scanMarkets, refreshInterval]);
  
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