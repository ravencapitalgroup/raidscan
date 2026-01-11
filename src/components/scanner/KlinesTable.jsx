import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { format } from 'date-fns';

export default function KlinesTable() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');
  const [klines, setKlines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchKlines = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await base44.functions.invoke('fetchKlinesData', {
        symbol: symbol.toUpperCase(),
        interval,
        limit: 50
      });

      if (result.data?.success) {
        setKlines(result.data.data);
      } else {
        setError(result.data?.error || 'Failed to fetch klines');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchKlines();
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex gap-4 flex-wrap items-end">
        <div>
          <label className="text-sm text-slate-400 block mb-2">Symbol</label>
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="e.g., BTCUSDT"
            className="w-40 bg-slate-900/50 border-slate-700"
          />
        </div>

        <div>
          <label className="text-sm text-slate-400 block mb-2">Interval</label>
          <Select value={interval} onValueChange={setInterval}>
            <SelectTrigger className="w-32 bg-slate-900/50 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1m">1m</SelectItem>
              <SelectItem value="5m">5m</SelectItem>
              <SelectItem value="15m">15m</SelectItem>
              <SelectItem value="1h">1h</SelectItem>
              <SelectItem value="4h">4h</SelectItem>
              <SelectItem value="1d">1d</SelectItem>
              <SelectItem value="1w">1w</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleSearch}
          disabled={loading}
          className="bg-amber-500 hover:bg-amber-600"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Fetch'}
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {klines.length > 0 && (
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700/50 hover:bg-slate-800/50">
                <TableHead className="text-slate-400 font-semibold">Time</TableHead>
                <TableHead className="text-slate-400 font-semibold text-right">Open</TableHead>
                <TableHead className="text-slate-400 font-semibold text-right">High</TableHead>
                <TableHead className="text-slate-400 font-semibold text-right">Low</TableHead>
                <TableHead className="text-slate-400 font-semibold text-right">Close</TableHead>
                <TableHead className="text-slate-400 font-semibold text-right">Change %</TableHead>
                <TableHead className="text-slate-400 font-semibold text-right">Volume</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {klines.map((kline, idx) => {
                const change = ((kline.close - kline.open) / kline.open) * 100;
                const isPositive = change >= 0;

                return (
                  <TableRow key={idx} className="border-slate-700/50 hover:bg-slate-800/30">
                    <TableCell className="text-slate-300 text-sm">
                      {format(new Date(kline.timestamp), 'MMM dd HH:mm')}
                    </TableCell>
                    <TableCell className="text-right text-slate-300">
                      ${kline.open.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-slate-300">
                      ${kline.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-slate-300">
                      ${kline.low.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-white font-semibold">
                      ${kline.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className={cn(
                        'flex items-center justify-end gap-1 font-semibold',
                        isPositive ? 'text-emerald-400' : 'text-rose-400'
                      )}>
                        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {Math.abs(change).toFixed(2)}%
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-slate-400 text-sm">
                      {(kline.volume / 1000000).toFixed(2)}M
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}