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
      const defaultActiveSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
      const updates = [];

      // Get existing symbols from database
      const existingWatchlistAssets = await base44.entities.WatchlistAsset.list();
      const existingSymbolsMap = new Map(existingWatchlistAssets.map(e => [e.symbol, e]));

      // Identify symbols to add (new symbols from Binance not in our database)
      const symbolsToAdd = newSymbols.filter(
        binanceSymbol => !existingSymbolsMap.has(binanceSymbol)
      );

      let categorizedCoins = [];
      if (symbolsToAdd.length > 0) {
        // Get categories for new symbols
        const categorizedResult = await base44.integrations.Core.InvokeLLM({
          prompt: `Categorize these crypto coins into: Layer 1, Layer 2, DeFi, AI, Gaming, Meme, Infrastructure, or Other. Return in the exact format: ${symbolsToAdd.join(', ')}`,
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
        categorizedCoins = categorizedResult.coins || [];
      }
      const categorizedMap = new Map(categorizedCoins.map(c => [c.symbol, c.category]));

      // Prepare create operations for new symbols
      for (const symbol of symbolsToAdd) {
        updates.push(base44.entities.WatchlistAsset.create({
          symbol: symbol,
          is_active: defaultActiveSymbols.includes(symbol),
          category: categorizedMap.get(symbol) || 'Other'
        }));
      }

      // Prepare update operations for existing symbols - reset to defaults
      for (const existingAsset of existingWatchlistAssets) {
        const isStillOnBinance = newSymbols.includes(existingAsset.symbol);
        let shouldBeActive = false;

        if (isStillOnBinance) {
          // Reset to default: only BTC, ETH, SOL should be active
          shouldBeActive = defaultActiveSymbols.includes(existingAsset.symbol);
        }

        if (existingAsset.is_active !== shouldBeActive) {
          updates.push(base44.entities.WatchlistAsset.update(existingAsset.id, { is_active: shouldBeActive }));
        }
      }
      
      await Promise.all(updates);
      
      return { added: symbolsToAdd.length, updated: updates.length - symbolsToAdd.length, total: newSymbols.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['watchlistAssets'] });
      queryClient.invalidateQueries({ queryKey: ['allWatchlistAssets'] });
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
  
  // Hidden component - only runs background logic
  return null;
}