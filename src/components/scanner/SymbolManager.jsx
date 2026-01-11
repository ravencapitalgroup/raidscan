import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';

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
        
        await base44.entities.WatchlistAsset.bulkCreate(
          categorized.coins.map(c => ({ 
            symbol: c.symbol, 
            is_active: c.symbol === 'BTCUSDT',
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
  
  // Auto-update on mount if no symbols exist
  useEffect(() => {
    const checkAndUpdate = async () => {
      const existing = await base44.entities.WatchlistAsset.list();
      
      if (existing.length === 0) {
        updateSymbols.mutate();
      }
    };
    
    checkAndUpdate();
  }, []);
  
  return null;
}