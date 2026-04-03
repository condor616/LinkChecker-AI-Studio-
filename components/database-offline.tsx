'use client';

import { useState } from 'react';
import { Database, AlertTriangle, RefreshCw } from 'lucide-react';

export function DatabaseOffline() {
  const [isStarting, setIsStarting] = useState(false);

  const handleStartDocker = async () => {
    setIsStarting(true);
    try {
      await fetch('/api/docker/start', { method: 'POST' });
      // Give it a moment to boot up before reloading
      setTimeout(() => {
        window.location.reload();
      }, 2500);
    } catch (e) {
      console.error(e);
      setIsStarting(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-destructive/10 p-6 flex flex-col items-center justify-center text-center border-b border-destructive/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_50%,transparent_75%)] bg-[length:250%_250%] animate-[shimmer_2s_linear_infinite]" />
          <AlertTriangle className="h-16 w-16 text-destructive mb-4 relative z-10" />
          <h2 className="text-2xl font-bold text-foreground mb-2 relative z-10">Database Offline</h2>
          <p className="text-sm text-muted-foreground relative z-10">
            Lynx Scan is actively connected to the server, but the underlying Database Docker Stack appears to be stopped.
          </p>
        </div>
        
        <div className="p-6 flex flex-col gap-4">
          <button
            onClick={handleStartDocker}
            disabled={isStarting}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-3 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:shadow-[0_0_25px_rgba(168,85,247,0.5)] disabled:opacity-70 disabled:pointer-events-none"
          >
            {isStarting ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : (
              <Database className="h-5 w-5" />
            )}
            {isStarting ? "Starting Database..." : "Start Database Stack"}
          </button>
          
          <button
            onClick={() => window.location.reload()}
            disabled={isStarting}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            I've started it manually. Reload Page
          </button>
        </div>
      </div>
    </div>
  );
}
