import React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export default function LoadingPopup({ isOpen, message = "Updating..." }) {
  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-slate-900 border border-slate-700 rounded-xl p-8 flex flex-col items-center gap-4"
      >
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        <p className="text-slate-200 font-medium">{message}</p>
      </motion.div>
    </motion.div>
  );
}