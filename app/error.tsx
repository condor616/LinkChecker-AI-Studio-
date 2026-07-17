'use client';

import { useEffect } from 'react';
import { Database, AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Next.js Page Error:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-destructive/10 p-6 flex flex-col items-center justify-center text-center border-b border-destructive/20">
          <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">Service Unavailable</h2>
          <p className="text-sm text-muted-foreground">
            Lynx Scan is unable to load this page. This usually happens when the backend database services are offline.
          </p>
        </div>
        
        <div className="p-6 flex flex-col gap-4">
          <div className="w-full flex items-center justify-center gap-2 bg-primary/10 text-primary px-4 py-3 rounded-lg font-bold border border-primary/20">
            <Database className="h-5 w-5" />
            Start infrastructure from host: npm run dev
          </div>
          
          <button
            onClick={() => reset()}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-4 w-4 inline mr-1" />
            Try Again
          </button>
        </div>
        
        <div className="px-6 pb-6 w-full max-w-full">
           <div className="p-3 rounded bg-muted/30 border border-border/50 text-[11px] font-mono text-muted-foreground/50 overflow-x-auto whitespace-pre">
             {error.message}
           </div>
        </div>
      </div>
    </div>
  );
}
