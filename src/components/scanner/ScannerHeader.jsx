import React from 'react';
import { Radar, Zap, Settings, RefreshCw } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function ScannerHeader({ 
  totalAssets, 
  activeRaids, 
  isScanning, 
  onRefresh,
  lastUpdate 
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center",
            "bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30"
          )}>
            <Radar className={cn(
              "w-7 h-7 text-amber-400",
              isScanning && "animate-pulse"
            )} />
          </div>
          {isScanning && (
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500" />
            </span>
          )}
        </div>
        
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            POI Raid Scanner
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Monitoring {totalAssets} altcoins for HTF liquidity sweeps
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        {activeRaids > 0 && (
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 px-3 py-1.5">
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            {activeRaids} Active Raid{activeRaids > 1 ? 's' : ''}
          </Badge>
        )}
        
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isScanning}
          className="bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700/50 hover:text-white"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isScanning && "animate-spin")} />
          Refresh
        </Button>
      </div>
    </div>
  );
}