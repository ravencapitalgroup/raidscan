import React from 'react';
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Activity, Circle } from 'lucide-react';
import { motion } from 'framer-motion';
import POIBadge from './POIBadge';
import RaidIndicator from './RaidIndicator';

export default function AssetCard({ 
  symbol, 
  price, 
  change24h, 
  pois, 
  activeRaids,
  isLoading 
}) {
  const isPositive = change24h >= 0;
  const hasActiveRaid = activeRaids && activeRaids.length > 0;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative group p-5 rounded-2xl border backdrop-blur-sm transition-all duration-500",
        "bg-slate-900/50 border-slate-700/50 hover:border-slate-600/50",
        hasActiveRaid && activeRaids[0].raid_direction === 'bullish' && "border-emerald-500/50 border-2 shadow-lg shadow-emerald-500/10",
        hasActiveRaid && activeRaids[0].raid_direction === 'bearish' && "border-rose-500/50 border-2 shadow-lg shadow-rose-500/10"
      )}
    >
      {/* Active raid glow */}
      {hasActiveRaid && (
        <div className={cn(
          "absolute inset-0 rounded-2xl animate-pulse",
          activeRaids[0].raid_direction === 'bullish' ? "bg-gradient-to-r from-emerald-500/5 via-transparent to-emerald-500/5" : "bg-gradient-to-r from-rose-500/5 via-transparent to-rose-500/5"
        )} />
      )}
      
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
            "bg-gradient-to-br from-slate-700 to-slate-800 text-slate-300"
          )}>
            {symbol.replace('USDT', '').slice(0, 3)}
          </div>
          <div>
            <h3 className="font-semibold text-white tracking-tight">
              {symbol.replace('USDT', '')}
            </h3>
            <span className="text-xs text-slate-500">USDT</span>
          </div>
        </div>
        
        <div className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium",
          isPositive 
            ? "bg-emerald-500/10 text-emerald-400" 
            : "bg-rose-500/10 text-rose-400"
        )}>
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {Math.abs(change24h).toFixed(2)}%
        </div>
      </div>
      
      {/* Price */}
      <div className="mb-5">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white font-mono tracking-tight">
            ${price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
          </span>
          {!isLoading && (
            <Circle className={cn(
              "w-2 h-2 fill-current",
              hasActiveRaid && activeRaids[0].raid_direction === 'bullish' ? "text-emerald-400 animate-pulse" : hasActiveRaid && activeRaids[0].raid_direction === 'bearish' ? "text-rose-400 animate-pulse" : "text-emerald-400"
            )} />
          )}
        </div>
      </div>
      
      {/* POIs Grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {pois && Object.entries(pois).map(([type, data]) => (
          <POIBadge 
            key={type}
            type={type}
            price={data.price}
            isRaided={data.isRaided}
            isActive={data.isActive}
            currentPrice={price}
          />
        ))}
      </div>
      
      {/* Active Raids */}
      {activeRaids && activeRaids.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-slate-700/50">
          {activeRaids.map((raid, idx) => (
            <RaidIndicator 
              key={idx}
              type={raid.poi_type}
              direction={raid.raid_direction}
              timestamp={raid.timestamp}
            />
          ))}
        </div>
      )}
      
      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 rounded-2xl bg-slate-900/80 flex items-center justify-center">
          <Activity className="w-6 h-6 text-slate-400 animate-pulse" />
        </div>
      )}
    </motion.div>
  );
}