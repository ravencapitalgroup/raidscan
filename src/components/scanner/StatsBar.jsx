import React from 'react';
import { TrendingUp, TrendingDown, Target, Zap } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function StatsBar({ stats }) {
  const statItems = [
    {
      label: 'PWH Raids',
      value: stats?.pwhRaids || 0,
      icon: TrendingUp,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10'
    },
    {
      label: 'PWL Raids',
      value: stats?.pwlRaids || 0,
      icon: TrendingDown,
      color: 'text-rose-400',
      bg: 'bg-rose-500/10'
    },
    {
      label: 'PMH Raids',
      value: stats?.pmhRaids || 0,
      icon: TrendingUp,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10'
    },
    {
      label: 'PML Raids',
      value: stats?.pmlRaids || 0,
      icon: TrendingDown,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10'
    },
    {
      label: 'PQH Raids',
      value: stats?.pqhRaids || 0,
      icon: Target,
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10'
    },
    {
      label: 'PQL Raids',
      value: stats?.pqlRaids || 0,
      icon: Zap,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10'
    },
  ];
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
      {statItems.map((item) => (
        <div
          key={item.label}
          className="p-4 rounded-xl bg-slate-900/50 border border-slate-700/50 backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", item.bg)}>
              <item.icon className={cn("w-5 h-5", item.color)} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{item.value}</p>
              <p className="text-xs text-slate-500">{item.label}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}