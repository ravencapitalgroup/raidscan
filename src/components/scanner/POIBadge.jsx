import React from 'react';
import { cn } from "@/lib/utils";

const poiConfig = {
  PWH: { label: 'PWH' },
  PWL: { label: 'PWL' },
  PMH: { label: 'PMH' },
  PML: { label: 'PML' },
  PQH: { label: 'PQH' },
  PQL: { label: 'PQL' },
};

export default function POIBadge({ type, price, isRaided, isActive, currentPrice }) {
  const config = poiConfig[type];
  const isHighPOI = type.includes('H');
  const proximityThreshold = 0.01; // 1% proximity

  const proximityPercent = currentPrice && price ? 
    Math.abs(currentPrice - price) / price : null;

  const isRaidActive = isRaided;
  const isApproaching = proximityPercent !== null && proximityPercent <= proximityThreshold;

  const getBackgroundColor = () => {
    if (isRaidActive) {
      return isHighPOI ? 'bg-emerald-500/30' : 'bg-rose-500/30';
    }
    if (isApproaching) {
      return isHighPOI ? 'bg-emerald-500/20' : 'bg-rose-500/20';
    }
    return 'bg-slate-800/50';
  };

  const getLabelColor = () => {
    return isHighPOI ? 'text-emerald-400' : 'text-rose-400';
  };

  const getBorderColor = () => {
    if (isRaidActive) {
      return isHighPOI ? 'border-emerald-500/50' : 'border-rose-500/50';
    }
    if (isApproaching) {
      return isHighPOI ? 'border-emerald-500/30' : 'border-rose-500/30';
    }
    return 'border-slate-700/50';
  };

  const getBorderWidth = () => {
    if (isRaidActive) return 'border-2';
    if (isApproaching) return 'border';
    return 'border';
  };
  
  return (
    <div className={cn(
      "relative flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-300",
      getBackgroundColor(),
      getTextColor(),
      getBorderColor(),
      getBorderWidth()
    )}>
      {isActive && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className={cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
            isHighPOI ? "bg-emerald-400" : "bg-rose-400"
          )} />
          <span className={cn(
            "relative inline-flex rounded-full h-3 w-3",
            isHighPOI ? "bg-emerald-500" : "bg-rose-500"
          )} />
        </span>
      )}
      <span className="font-mono text-xs font-semibold">{config.label}</span>
      <span className="font-mono text-xs opacity-70">
        ${price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
      </span>
    </div>
  );
}