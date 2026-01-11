import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ScannerHeader from '@/components/scanner/ScannerHeader';
import AssetCard from '@/components/scanner/AssetCard';
import RaidAlertFeed from '@/components/scanner/RaidAlertFeed';
import StatsBar from '@/components/scanner/StatsBar';
import { Input } from "@/components/ui/input";
import { Search, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Top Binance altcoins to scan
const DEFAULT_SYMBOLS = [
  'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT',
  'AVAXUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT', 'ATOMUSDT',
  'LTCUSDT', 'UNIUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT',
  'NEARUSDT', 'INJUSDT', 'SUIUSDT', 'SEIUSDT', 'TIAUSDT'
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

// Fetch current prices from Binance API
const fetchPrices = async (symbols) => {
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(symbols)}`
    );
    const data = await response.json();
    return data.reduce((acc, item) => {
      acc[item.symbol] = {
        price: parseFloat(item.lastPrice),
        change24h: parseFloat(item.priceChangePercent)
      };
      return acc;
    }, {});
  } catch (error) {
    console.error('Error fetching prices:', error);
    return {};
  }
};

export default function Scanner() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isScanning, setIsScanning] = useState(false);
  const [assetData, setAssetData] = useState({});
  const queryClient = useQueryClient();

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
    setIsScanning(true);
    
    const prices = await fetchPrices(DEFAULT_SYMBOLS);
    
    const newAssetData = {};
    const newRaids = [];
    
    for (const symbol of DEFAULT_SYMBOLS) {
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
  }, []);

  // Initial scan and periodic refresh
  useEffect(() => {
    scanMarkets();
    const interval = setInterval(scanMarkets, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [scanMarkets]);

  // Filter assets
  const filteredSymbols = DEFAULT_SYMBOLS.filter(symbol => {
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
      {/* Background pattern */}
      <div className="fixed inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDI5M2EiIGZpbGwtb3BhY2l0eT0iMC4zIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0tNiA2aC0ydi00aDJ2NHptMC02aC0ydi00aDJ2NHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30 pointer-events-none" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ScannerHeader
          totalAssets={DEFAULT_SYMBOLS.length}
          activeRaids={totalActiveRaids}
          isScanning={isScanning}
          onRefresh={scanMarkets}
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