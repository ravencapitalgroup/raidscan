import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ArrowUpRight, ArrowDownRight, Clock, X } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { format } from 'date-fns';

export default function RaidAlertFeed({ alerts, onDismiss }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-700/50 text-center">
        <Zap className="w-8 h-8 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 text-sm">No active raids detected</p>
        <p className="text-slate-500 text-xs mt-1">Monitoring for HTF POI sweeps...</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Live Raid Feed
        </h3>
        <span className="text-xs text-slate-500">
          <Clock className="w-3 h-3 inline mr-1" />
          Real-time
        </span>
      </div>
      
      <AnimatePresence>
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: -20, height: 0 }}
            animate={{ opacity: 1, x: 0, height: 'auto' }}
            exit={{ opacity: 0, x: 20, height: 0 }}
            className={cn(
              "relative p-4 rounded-xl border backdrop-blur-sm overflow-hidden",
              alert.raid_direction === 'bullish'
                ? "bg-emerald-500/5 border-emerald-500/20"
                : "bg-rose-500/5 border-rose-500/20"
            )}
          >
            {/* Gradient accent */}
            <div className={cn(
              "absolute left-0 top-0 bottom-0 w-1 rounded-l-xl",
              alert.raid_direction === 'bullish' ? "bg-emerald-500" : "bg-rose-500"
            )} />
            
            <div className="flex items-start justify-between ml-2">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  alert.raid_direction === 'bullish' 
                    ? "bg-emerald-500/20" 
                    : "bg-rose-500/20"
                )}>
                  {alert.raid_direction === 'bullish' 
                    ? <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                    : <ArrowDownRight className="w-5 h-5 text-rose-400" />
                  }
                </div>
                
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">
                      {alert.symbol.replace('USDT', '')}
                    </span>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-xs font-semibold",
                      alert.poi_type.includes('H') 
                        ? "bg-cyan-500/20 text-cyan-400"
                        : "bg-amber-500/20 text-amber-400"
                    )}>
                      {alert.poi_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    <span>POI: ${alert.poi_price?.toLocaleString()}</span>
                    <span>→</span>
                    <span className={cn(
                      alert.raid_direction === 'bullish' ? "text-emerald-400" : "text-rose-400"
                    )}>
                      ${alert.raid_price?.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  {format(new Date(alert.created_date), 'HH:mm:ss')}
                </span>
                {onDismiss && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-slate-500 hover:text-slate-300"
                    onClick={() => onDismiss(alert.id)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}