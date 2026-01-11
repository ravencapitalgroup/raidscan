import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { RefreshCcw, CheckCircle } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function SymbolManager({ onUpdate }) {
  const queryClient = useQueryClient();
  
  const updateSymbols = useMutation({
    mutationFn: async () => {
      // Fetch all Binance perpetual futures symbols and CoinGecko data
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Search CoinGecko for ALL cryptocurrency coins that have Binance perpetual futures trading pairs. For each coin, get: symbol (in USDT format like BTCUSDT), category (Layer 1, Layer 2, DeFi, AI, Gaming, Meme, Infrastructure, or Other), and market_cap_rank. Include at least 100 top coins that trade on Binance Futures.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            coins: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  symbol: { type: "string" },
                  category: { type: "string" },
                  market_cap_rank: { type: "number" }
                }
              }
            }
          }
        }
      });
      
      const newCoins = result.coins || [];
      
      // Get existing symbols from database
      const existing = await base44.entities.WatchlistAsset.list();
      const existingSymbols = existing.map(e => e.symbol);
      
      // Add new symbols
      const toAdd = newCoins.filter(c => !existingSymbols.includes(c.symbol));
      if (toAdd.length > 0) {
        await base44.entities.WatchlistAsset.bulkCreate(
          toAdd.map(c => ({ 
            symbol: c.symbol, 
            is_active: true,
            category: c.category,
            market_cap_rank: c.market_cap_rank
          }))
        );
      }
      
      // Update existing with CoinGecko data
      for (const coin of newCoins) {
        const asset = existing.find(e => e.symbol === coin.symbol);
        if (asset) {
          await base44.entities.WatchlistAsset.update(asset.id, {
            category: coin.category,
            market_cap_rank: coin.market_cap_rank
          });
        }
      }
      
      // Mark removed symbols as inactive
      const newSymbols = newCoins.map(c => c.symbol);
      const toDeactivate = existingSymbols.filter(s => !newSymbols.includes(s));
      for (const symbol of toDeactivate) {
        const asset = existing.find(e => e.symbol === symbol);
        if (asset && asset.is_active) {
          await base44.entities.WatchlistAsset.update(asset.id, { is_active: false });
        }
      }
      
      return { added: toAdd.length, updated: newCoins.length - toAdd.length, deactivated: toDeactivate.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['watchlistAssets'] });
      queryClient.invalidateQueries({ queryKey: ['allWatchlistAssets'] });
      if (onUpdate) onUpdate(data);
      localStorage.setItem('coingecko_last_scan', Date.now().toString());
    },
  });
  
  // Auto-update once per day
  useEffect(() => {
    const checkAndUpdate = async () => {
      const lastScan = localStorage.getItem('coingecko_last_scan');
      const now = Date.now();
      const dayInMs = 24 * 60 * 60 * 1000;
      
      if (!lastScan || (now - parseInt(lastScan)) > dayInMs) {
        const existing = await base44.entities.WatchlistAsset.list();
        if (existing.length === 0 || (now - parseInt(lastScan)) > dayInMs) {
          updateSymbols.mutate();
        }
      }
    };
    
    checkAndUpdate();
  }, []);
  
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => updateSymbols.mutate()}
      disabled={updateSymbols.isPending}
      className="bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700/50 hover:text-white"
    >
      {updateSymbols.isPending ? (
        <>
          <RefreshCcw className="w-4 h-4 mr-2 animate-spin" />
          Syncing...
        </>
      ) : updateSymbols.isSuccess ? (
        <>
          <CheckCircle className="w-4 h-4 mr-2 text-green-400" />
          Synced
        </>
      ) : (
        <>
          <RefreshCcw className="w-4 h-4 mr-2" />
          Sync CoinGecko
        </>
      )}
    </Button>
  );
}