'use client';

import { Database, AlertTriangle } from 'lucide-react';

export function DatabaseOffline() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-destructive/10 p-6 flex flex-col items-center justify-center text-center border-b border-destructive/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_50%,transparent_75%)] bg-[length:250%_250%] animate-[shimmer_2s_linear_infinite]" />
          <AlertTriangle className="h-16 w-16 text-destructive mb-4 relative z-10" />
          <h2 className="text-2xl font-bold text-foreground mb-2 relative z-10">Database Offline</h2>
          <p className="text-sm text-muted-foreground relative z-10">
            Lynx Scan is connected to the app service, but the database/redis infrastructure is not reachable.
          </p>
        </div>
        
        <div className="p-6 flex flex-col gap-4">
          <div className="w-full flex items-center justify-center gap-2 bg-primary/10 text-primary px-4 py-3 rounded-lg font-bold border border-primary/20">
            <Database className="h-5 w-5" />
            Start infrastructure from host: npm run dev
          </div>
          
          <button
            onClick={() => window.location.reload()}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            I started it manually. Reload page
          </button>
        </div>
      </div>
    </div>
  );
}
