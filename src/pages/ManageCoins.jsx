import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Search, ToggleLeft, ToggleRight, Coins, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion } from 'framer-motion';
import { useScannerData } from '@/components/scanner/ScannerContext';

const categoryColors = {
  'Layer 1': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Layer 2': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'DeFi': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'AI': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Gaming': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'Meme': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'Infrastructure': 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  'Other': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const normalizeSymbol = (symbol) => {
  if (!symbol.endsWith('USDT')) {
    return symbol + 'USDT';
  }
  return symbol;
};

export default function ManageCoins() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const queryClient = useQueryClient();
  const { scanMarkets } = useScannerData();

  const { data: assets = [] } = useQuery({
    queryKey: ['watchlistAssets'],
    queryFn: () => base44.entities.WatchlistAsset.list(),
  });

  const toggleAsset = useMutation({
    mutationFn: async ({ id, is_active }) => {
      await base44.entities.WatchlistAsset.update(id, { is_active });
      
      // If turning on, trigger refreshes after 2 seconds
      if (is_active) {
        setTimeout(async () => {
          try {
            await scanMarkets();
          } catch (err) {
            console.error('Error refreshing data after toggle:', err);
          }
        }, 2000);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlistAssets'] });
    },
  });

  const categoryOrder = ['Layer 1', 'Layer 2', 'DeFi', 'AI', 'Gaming', 'Meme', 'Infrastructure', 'Other'];
  const categories = ['all', ...categoryOrder];
  
  const sortedAndFilteredAssets = assets
    .filter(asset => {
      const matchesSearch = asset.symbol.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || asset.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const groupedAssets = sortedAndFilteredAssets.reduce((acc, asset) => {
    const cat = asset.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(asset);
    return acc;
  }, {});

  const sortedGroupedAssets = Object.entries(groupedAssets).sort(([catA], [catB]) => {
    return categoryOrder.indexOf(catA) - categoryOrder.indexOf(catB);
  });

  const activeCount = assets.filter(a => a.is_active).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="fixed inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDI5M2EiIGZpbGwtb3BhY2l0eT0iMC4zIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0tNiA2aC0ydi00aDJ2NHptMC02aC0ydi00aDJ2NHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30 pointer-events-none" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex items-center gap-4">
            <Link to={createPageUrl('Scanner')}>
              <Button variant="outline" size="icon" className="bg-slate-800/50 border-slate-700 text-slate-300">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
                <Coins className="w-7 h-7 text-cyan-400" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                  Manage Coins
                </h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  {activeCount} of {assets.length} coins active
                </p>
              </div>
            </div>
          </div>

          {/* Search & Stats */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search coins..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
            
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/50 border border-slate-700/50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm text-slate-300 font-medium">{activeCount} Active</span>
              </div>
              <span className="text-slate-600">•</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-slate-600" />
                <span className="text-sm text-slate-500">{assets.length - activeCount} Inactive</span>
              </div>
            </div>
          </div>

          {/* Category Filters */}
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all border",
                  selectedCategory === cat
                    ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
                    : "bg-slate-900/50 text-slate-400 border-slate-700/50 hover:border-slate-600/50"
                )}
              >
                {cat === 'all' ? 'All Categories' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grouped Coins List */}
        <div className="space-y-6">
          {sortedGroupedAssets.map(([category, categoryAssets]) => (
            <div key={category}>
              <div className="flex items-center gap-3 mb-4">
                <Badge className={cn("px-3 py-1", categoryColors[category])}>
                  {category}
                </Badge>
                <span className="text-sm text-slate-500">
                  {categoryAssets.length} coin{categoryAssets.length !== 1 ? 's' : ''}
                </span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {categoryAssets.map((asset) => (
                   <motion.button
                     key={asset.id}
                     onClick={() => toggleAsset.mutate({ id: asset.id, is_active: !asset.is_active })}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-xl border transition-all",
                      "hover:scale-[1.02] active:scale-[0.98]",
                      asset.is_active
                        ? "bg-slate-900/50 border-slate-700/50 hover:border-cyan-500/30"
                        : "bg-slate-900/30 border-slate-800/50 opacity-60 hover:opacity-100"
                    )}
                    whileHover={{ y: -2 }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs",
                        asset.is_active
                          ? "bg-gradient-to-br from-slate-700 to-slate-800 text-slate-300"
                          : "bg-slate-800/50 text-slate-600"
                      )}>
                        {asset.symbol.replace('USDT', '').slice(0, 3)}
                      </div>
                      <div className="text-left">
                         <div className="flex items-center gap-2">
                           <p className={cn(
                             "font-semibold tracking-tight",
                             asset.is_active ? "text-white" : "text-slate-600"
                           )}>
                             {asset.symbol.replace('USDT', '')}
                           </p>
                           {asset.source === 'binance' && (
                             <span className="w-3.5 h-3.5 rounded-full bg-yellow-500 opacity-60" title="Binance" />
                           )}
                           {asset.source === 'binanceus' && (
                             <span className="w-3.5 h-3.5 rounded-full bg-yellow-500 opacity-40" title="Binance US" />
                           )}
                           {asset.new_added_date && new Date(asset.new_added_date).getTime() > Date.now() - 86400000 && (
                             <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs px-2 py-0.5">
                               <Sparkles className="w-2.5 h-2.5 mr-1" />
                               New
                             </Badge>
                           )}
                         </div>
                         {asset.market_cap_rank && (
                           <p className="text-xs text-slate-500">
                             Rank #{asset.market_cap_rank}
                           </p>
                         )}
                       </div>
                    </div>
                    
                    {asset.is_active ? (
                      <ToggleRight className="w-6 h-6 text-cyan-400" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-slate-600" />
                    )}
                  </motion.button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {sortedAndFilteredAssets.length === 0 && (
          <div className="text-center py-16">
            <Coins className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No coins found</p>
          </div>
        )}
      </div>
    </div>
  );
}