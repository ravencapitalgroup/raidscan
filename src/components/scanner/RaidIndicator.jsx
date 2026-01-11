import React from 'react';
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { useScannerData } from './ScannerContext';
import { formatTimestamp } from './formatTimestamp';

export default function RaidIndicator({ type, direction, timestamp }) {
  const isBullish = direction === 'bullish';
  const { timezone } = useScannerData();
  const formattedTime = formatTimestamp(timestamp, timezone);
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-xl border backdrop-blur-sm",
        isBullish 
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
          : "bg-rose-500/10 border-rose-500/30 text-rose-400"
      )}
    >
      <div className={cn(
        "flex items-center justify-center w-8 h-8 rounded-lg",
        isBullish ? "bg-emerald-500/20" : "bg-rose-500/20"
      )}>
        <Zap className="w-4 h-4" />
      </div>
      <div className="flex flex-col">
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide">
            {type} Raid
          </span>
          {isBullish ? (
            <ArrowUpRight className="w-3 h-3" />
          ) : (
            <ArrowDownRight className="w-3 h-3" />
          )}
        </div>
        <span className="text-[10px] opacity-60">
          {formattedTime}
        </span>
      </div>
    </motion.div>
  );
}