import React from 'react';
import { cn } from "@/lib/utils";

const poiConfig = {
  PWH: { label: 'PWH', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  PWL: { label: 'PWL', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  PMH: { label: 'PMH', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  PML: { label: 'PML', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  PQH: { label: 'PQH', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  PQL: { label: 'PQL', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

export default function POIBadge({ type, price, isRaided, isActive }) {
  const config = poiConfig[type];
  
  return (
    <div className={cn(
      "relative flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-300",
      config.color,
      isRaided && "ring-2 ring-offset-1 ring-offset-slate-900",
      isRaided && type.includes('H') ? "ring-emerald-500" : isRaided ? "ring-rose-500" : ""
    )}>
      {isActive && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className={cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
            type.includes('H') ? "bg-emerald-400" : "bg-rose-400"
          )} />
          <span className={cn(
            "relative inline-flex rounded-full h-3 w-3",
            type.includes('H') ? "bg-emerald-500" : "bg-rose-500"
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