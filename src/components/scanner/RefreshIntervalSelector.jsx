import React from 'react';
import { Clock, Zap } from 'lucide-react';
import { cn } from "@/lib/utils";
import { motion } from 'framer-motion';

const INTERVALS = [
  { label: '5 Minutes', value: 300000, shortLabel: '5m', icon: '⚡' },
  { label: '30 Minutes', value: 1800000, shortLabel: '30m', icon: '🕐' },
  { label: '1 Hour', value: 3600000, shortLabel: '1h', icon: '⏰' },
];

export default function RefreshIntervalSelector({ value, onChange, nextRefresh }) {
  const timeUntilRefresh = nextRefresh ? Math.max(0, Math.ceil((nextRefresh - Date.now()) / 1000)) : 0;
  const minutes = Math.floor(timeUntilRefresh / 60);
  const seconds = timeUntilRefresh % 60;
  
  const selectedInterval = INTERVALS.find(i => i.value === value) || INTERVALS[0];
  const progress = nextRefresh ? ((value / 1000 - timeUntilRefresh) / (value / 1000)) * 100 : 0;
  
  return (
    <div className="flex flex-col gap-3">
      {/* Interval Selector */}
      <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700/50 rounded-xl p-1.5 backdrop-blur-sm">
        {INTERVALS.map((interval) => (
          <button
            key={interval.value}
            onClick={() => onChange(interval.value)}
            className={cn(
              "relative flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300",
              "hover:bg-slate-700/30",
              value === interval.value
                ? "bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/30 shadow-lg"
                : "text-slate-400 border border-transparent"
            )}
          >
            {value === interval.value && (
              <motion.div
                layoutId="activeInterval"
                className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-lg"
                transition={{ type: "spring", duration: 0.6 }}
              />
            )}
            <span className="relative flex items-center justify-center gap-1.5">
              <span className="text-base">{interval.icon}</span>
              {interval.shortLabel}
            </span>
          </button>
        ))}
      </div>
      
      {/* Countdown Timer */}
      <div className="relative bg-slate-900/50 border border-slate-700/50 rounded-xl p-3 backdrop-blur-sm overflow-hidden">
        {/* Progress bar */}
        <motion.div
          className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500"
          style={{ width: `${progress}%` }}
          transition={{ duration: 1 }}
        />
        
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Next refresh in</p>
              <p className="text-sm font-mono font-semibold text-white">
                {minutes > 0 ? `${minutes}m ` : ''}{seconds}s
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/30">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-medium text-slate-300">
              Auto-refresh: {selectedInterval.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}