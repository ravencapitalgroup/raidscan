import React, { useState } from 'react';
import { useScannerData } from '@/components/scanner/ScannerContext';
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import ScannerHeader from '@/components/scanner/ScannerHeader';

export default function CoinData() {
  const [searchQuery, setSearchQuery] = useState('');
  const { assetData, symbols, isScanning, refreshInterval, setRefreshInterval, nextRefresh, scanMarkets } = useScannerData();

  const filteredSymbols = symbols.filter(symbol => 
    symbol.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort();

  const totalActiveRaids = Object.values(assetData).reduce(
    (sum, data) => sum + (data.activeRaids?.length || 0), 0
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="fixed inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDI5M2EiIGZpbGwtb3BhY2l0eT0iMC4zIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0tNiA2aC0ydi00aDJ2NHptMC02aC0ydi00aDJ2NHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30 pointer-events-none" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ScannerHeader
          title="POI Raid Data"
          totalAssets={symbols.length}
          activeRaids={totalActiveRaids}
          isScanning={isScanning}
          onRefresh={() => {
            scanMarkets();
          }}
          refreshInterval={refreshInterval}
          onRefreshIntervalChange={setRefreshInterval}
          nextRefresh={nextRefresh}
        />

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              placeholder="Search coins..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 backdrop-blur-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700/50 hover:bg-slate-800/50">
                <TableHead className="text-slate-400 font-semibold">Symbol</TableHead>
                <TableHead className="text-slate-400 font-semibold text-right">Price</TableHead>
                <TableHead className="text-slate-400 font-semibold text-right">24h Change</TableHead>
                <TableHead className="text-slate-400 font-semibold text-right">PWH</TableHead>
                <TableHead className="text-slate-400 font-semibold text-right">PWL</TableHead>
                <TableHead className="text-slate-400 font-semibold text-right">PMH</TableHead>
                <TableHead className="text-slate-400 font-semibold text-right">PML</TableHead>
                <TableHead className="text-slate-400 font-semibold text-right">PQH</TableHead>
                <TableHead className="text-slate-400 font-semibold text-right">PQL</TableHead>
                <TableHead className="text-slate-400 font-semibold text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSymbols.map(symbol => {
                const data = assetData[symbol];
                const isPositive = data?.change24h >= 0;
                const hasRaids = data?.activeRaids?.length > 0;

                return (
                  <TableRow 
                    key={symbol} 
                    className={cn(
                      "border-slate-700/50 hover:bg-slate-800/30 transition-colors",
                      hasRaids && "bg-amber-500/5"
                    )}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs bg-gradient-to-br from-slate-700 to-slate-800 text-slate-300">
                          {symbol.slice(0, 3)}
                        </div>
                        <span className="text-white font-semibold">
                          {symbol}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {data ? (
                        <span className="text-white font-mono font-semibold">
                          ${data.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                        </span>
                      ) : (
                        <Activity className="w-4 h-4 text-slate-500 animate-pulse ml-auto" />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {data ? (
                        <div className={cn(
                          "flex items-center justify-end gap-1 font-semibold",
                          isPositive ? "text-emerald-400" : "text-rose-400"
                        )}>
                          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {Math.abs(data.change24h).toFixed(2)}%
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {data?.pois?.PWH ? (
                        <span className={cn(
                          "font-mono text-sm",
                          data.pois.PWH.isActive ? "text-cyan-400 font-semibold" : "text-slate-400"
                        )}>
                          ${data.pois.PWH.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {data?.pois?.PWL ? (
                        <span className={cn(
                          "font-mono text-sm",
                          data.pois.PWL.isActive ? "text-cyan-400 font-semibold" : "text-slate-400"
                        )}>
                          ${data.pois.PWL.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {data?.pois?.PMH ? (
                        <span className={cn(
                          "font-mono text-sm",
                          data.pois.PMH.isActive ? "text-purple-400 font-semibold" : "text-slate-400"
                        )}>
                          ${data.pois.PMH.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {data?.pois?.PML ? (
                        <span className={cn(
                          "font-mono text-sm",
                          data.pois.PML.isActive ? "text-pink-400 font-semibold" : "text-slate-400"
                        )}>
                          ${data.pois.PML.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {data?.pois?.PQH ? (
                        <span className={cn(
                          "font-mono text-sm",
                          data.pois.PQH.isActive ? "text-amber-400 font-semibold" : "text-slate-400"
                        )}>
                          ${data.pois.PQH.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {data?.pois?.PQL ? (
                        <span className={cn(
                          "font-mono text-sm",
                          data.pois.PQL.isActive ? "text-amber-400 font-semibold" : "text-slate-400"
                        )}>
                          ${data.pois.PQL.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {hasRaids ? (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                          {data.activeRaids.length} Raid{data.activeRaids.length > 1 ? 's' : ''}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-slate-700 text-slate-500">
                          Clear
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {filteredSymbols.length === 0 && (
          <div className="text-center py-16">
            <Search className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No coins found</p>
          </div>
        )}
      </div>
    </div>
  );
}