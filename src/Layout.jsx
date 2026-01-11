import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Radar, Settings } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function Layout({ children, currentPageName }) {
  return (
    <div className="min-h-screen bg-slate-950">
      <style>{`
        :root {
          --background: 222.2 84% 4.9%;
          --foreground: 210 40% 98%;
          --card: 222.2 84% 4.9%;
          --card-foreground: 210 40% 98%;
          --popover: 222.2 84% 4.9%;
          --popover-foreground: 210 40% 98%;
          --primary: 38 92% 50%;
          --primary-foreground: 222.2 84% 4.9%;
          --secondary: 217.2 32.6% 17.5%;
          --secondary-foreground: 210 40% 98%;
          --muted: 217.2 32.6% 17.5%;
          --muted-foreground: 215 20.2% 65.1%;
          --accent: 217.2 32.6% 17.5%;
          --accent-foreground: 210 40% 98%;
          --destructive: 0 62.8% 30.6%;
          --destructive-foreground: 210 40% 98%;
          --border: 217.2 32.6% 17.5%;
          --input: 217.2 32.6% 17.5%;
          --ring: 38 92% 50%;
        }
        
        body {
          font-family: 'Inter', system-ui, sans-serif;
        }
        
        .font-mono {
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
        }
        
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        
        ::-webkit-scrollbar-track {
          background: rgba(30, 41, 59, 0.5);
        }
        
        ::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.5);
          border-radius: 3px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(100, 116, 139, 0.8);
        }
      `}</style>
      
      {/* Top Navigation */}
      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <Link 
                to={createPageUrl('Scanner')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
                  currentPageName === 'Scanner'
                    ? "bg-amber-500/10 text-amber-400"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                )}
              >
                <Radar className="w-4 h-4" />
                <span className="font-medium text-sm">Scanner</span>
              </Link>
              
              <Link 
                to={createPageUrl('ManageCoins')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
                  currentPageName === 'ManageCoins'
                    ? "bg-cyan-500/10 text-cyan-400"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                )}
              >
                <Settings className="w-4 h-4" />
                <span className="font-medium text-sm">Manage Coins</span>
              </Link>
            </div>
          </div>
        </div>
      </nav>
      
      {children}
    </div>
  );
}