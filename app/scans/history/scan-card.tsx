'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, CheckCircle, AlertCircle, Clock, ChevronRight, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import * as motion from 'motion/react-client';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export function ScanCard({ scan, i }: { scan: any, i: number }) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const router = useRouter();

    const config = JSON.parse(scan.config);
    const startUrl = config.startUrl || 'No URL';

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowConfirm(true);
    };

    const confirmDelete = async () => {
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/scans/${scan.id}`, { method: 'DELETE' });
            if (res.ok) {
                router.refresh();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsDeleting(false);
            setShowConfirm(false);
        }
    };

    return (
        <>
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
          <div className="group relative">
            <Link href={`/scans/${scan.id}`}>
              <Card className="hover:bg-muted/50 transition-all duration-300 cursor-pointer border border-border hover:border-primary/30 group/card relative overflow-hidden h-full glass-vibrant hover:shadow-[0_0_20px_rgba(168,85,247,0.1)]">
                <div className={cn(
                  "absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 group-hover/card:w-1.5",
                  scan.status === 'RUNNING' ? "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" :
                  scan.status === 'COMPLETED' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" :
                  scan.status === 'FAILED' ? "bg-destructive shadow-[0_0_10px_rgba(var(--destructive),0.5)]" :
                  "bg-slate-500"
                )} />
                <CardContent className="p-6 flex items-center justify-between">
                  <div className="space-y-2 min-w-0 pr-8">
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-lg truncate text-foreground group-hover/card:text-primary transition-colors">{scan.name}</h3>
                      {scan.status === 'RUNNING' && (
                         <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-black uppercase tracking-widest animate-pulse">
                           Processing
                         </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(scan.createdAt).toLocaleDateString()} at {new Date(scan.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-muted-foreground">•</span>
                      <span className="truncate max-w-[200px] md:max-w-md">{startUrl}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right hidden md:block">
                      <p className="text-[10px] text-muted-foreground uppercase font-black tracking-[0.2em] mb-1.5">Engine Status</p>
                      <div className={cn(
                          "flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold",
                          scan.status === 'RUNNING' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                          scan.status === 'COMPLETED' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          scan.status === 'FAILED' ? "bg-destructive/10 text-destructive border-destructive/20" :
                          "bg-slate-500/10 text-slate-400 border-slate-500/20"
                      )}>
                          {scan.status === 'RUNNING' && <Activity className="h-3 w-3 animate-spin" />}
                          {scan.status === 'COMPLETED' && <CheckCircle className="h-3 w-3" />}
                          {scan.status === 'FAILED' && <AlertCircle className="h-3 w-3" />}
                          {scan.status === 'IDLE' && <Clock className="h-3 w-3" />}
                          <span className="tracking-wide uppercase text-[10px]">{scan.status}</span>
                      </div>
                  </div>
                  
                  {scan.status !== 'RUNNING' && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="opacity-0 group-hover:opacity-100 transition-all hover:text-destructive hover:bg-destructive/10 h-10 w-10 rounded-full border border-transparent hover:border-destructive/20 shrink-0"
                        onClick={handleDelete}
                      >
                        <Trash2 className="h-5 w-5 text-muted-foreground group-hover:text-destructive" />
                      </Button>
                  )}

                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center group-hover/card:bg-primary/20 group-hover/card:text-primary transition-all shrink-0">
                    <ChevronRight className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          </div>
        </motion.div>

        {showConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-8 space-y-6 relative overflow-hidden"
                >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-destructive to-orange-500" />
                    
                    <div className="flex items-center gap-4 text-destructive">
                         <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center shrink-0">
                            <AlertTriangle className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-foreground">Delete Scan?</h3>
                            <p className="text-sm text-muted-foreground mt-1 font-medium">This action cannot be undone.</p>
                        </div>
                    </div>

                    <div className="bg-muted/30 rounded-xl p-4 border border-border">
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            Are you sure you want to delete <span className="font-bold text-foreground">"{ scan.name}"</span>? All results and discovered links will be <span className="text-destructive font-bold">permanently removed</span> from the database.
                        </p>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                        <Button variant="ghost" onClick={() => setShowConfirm(false)} disabled={isDeleting} className="hover:bg-white/5 rounded-xl font-bold">Cancel</Button>
                        <Button 
                            variant="destructive" 
                            onClick={confirmDelete} 
                            disabled={isDeleting}
                            className="bg-destructive hover:bg-destructive/90 shadow-lg shadow-destructive/20 px-6 rounded-xl font-black uppercase tracking-widest text-xs h-11 text-white"
                        >
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Delete Permanently'}
                        </Button>
                    </div>
                </motion.div>
            </div>
        )}
        </>
    );
}
