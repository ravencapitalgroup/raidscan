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
      // Fetch all Binance perpetual futures symbols
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Get a comprehensive list of ALL active perpetual futures trading pairs on Binance (USDT-margined futures only). Include all major altcoins. Return ONLY the symbols in the format like BTCUSDT, ETHUSDT, etc. Include at least 50+ actively traded pairs.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            symbols: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      });
      
      const newSymbols = result.symbols || [];
      
      // Get existing symbols from database
      const existing = await base44.entities.WatchlistAsset.list();
      const existingSymbols = existing.map(e => e.symbol);
      
      // Categorize and add new symbols
      const toAdd = newSymbols.filter(s => !existingSymbols.includes(s));
      if (toAdd.length > 0) {
        // Get categories for new symbols
        const categorized = await base44.integrations.Core.InvokeLLM({
          prompt: `Categorize these crypto coins into: Layer 1, Layer 2, DeFi, AI, Gaming, Meme, Infrastructure, or Other. Return in the exact format: ${toAdd.join(', ')}`,
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
                    category: { type: "string" }
                  }
                }
              }
            }
          }
        });
        
        // Only BTC, ETH, and SOL are active by default
        const defaultActive = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
        
        await base44.entities.WatchlistAsset.bulkCreate(
          categorized.coins.map(c => ({ 
            symbol: c.symbol, 
            is_active: defaultActive.includes(c.symbol),
            category: c.category 
          }))
        );
      }
      
      // Mark removed symbols as inactive (don't delete, keep historical data)
      const toDeactivate = existingSymbols.filter(s => !newSymbols.includes(s));
      for (const symbol of toDeactivate) {
        const asset = existing.find(e => e.symbol === symbol);
        if (asset && asset.is_active) {
          await base44.entities.WatchlistAsset.update(asset.id, { is_active: false });
        }
      }
      
      return { added: toAdd.length, deactivated: toDeactivate.length, total: newSymbols.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['watchlistAssets'] });
      if (onUpdate) onUpdate(data);
    },
  });
  
  // Auto-update on mount if no symbols exist or it's been more than 24 hours
  useEffect(() => {
    const checkAndUpdate = async () => {
      const existing = await base44.entities.WatchlistAsset.list();
      const lastUpdate = localStorage.getItem('symbols_last_update');
      const now = Date.now();
      const dayInMs = 24 * 60 * 60 * 1000;
      
      if (existing.length === 0 || !lastUpdate || (now - parseInt(lastUpdate)) > dayInMs) {
        updateSymbols.mutate();
        localStorage.setItem('symbols_last_update', now.toString());
      }
    };
    
    checkAndUpdate();
  }, []);
  
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        updateSymbols.mutate();
        localStorage.setItem('symbols_last_update', Date.now().toString());
      }}
      disabled={updateSymbols.isPending}
      className="bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700/50 hover:text-white"
    >
      {updateSymbols.isPending ? (
        <>
          <RefreshCcw className="w-4 h-4 mr-2 animate-spin" />
          Updating...
        </>
      ) : updateSymbols.isSuccess ? (
        <>
          <CheckCircle className="w-4 h-4 mr-2 text-green-400" />
          Updated
        </>
      ) : (
        <>
          <RefreshCcw className="w-4 h-4 mr-2" />
          Update Symbols
        </>
      )}
    </Button>
  );
}