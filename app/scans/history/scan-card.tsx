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
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="h-full">
          <div className="group relative h-full">
            <Link href={`/scans/${scan.id}`} className="block h-full">
              <Card className="hover:bg-muted/50 transition-all duration-300 cursor-pointer border border-border hover:border-primary/30 group/card relative overflow-hidden h-full glass-vibrant hover:shadow-[0_0_20px_rgba(168,85,247,0.1)]">
                <div className={cn(
                  "absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 group-hover/card:w-1.5",
                  scan.status === 'RUNNING' ? "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" :
                  scan.status === 'COMPLETED' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" :
                  scan.status === 'FAILED' ? "bg-destructive shadow-[0_0_10px_rgba(var(--destructive),0.5)]" :
                  "bg-slate-500"
                )} />
                <CardContent className="p-5 pl-6 flex flex-col gap-4 h-full">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg leading-snug line-clamp-2 text-foreground group-hover/card:text-primary transition-colors">{scan.name}</h3>
                        {scan.status === 'RUNNING' && (
                           <span className="shrink-0 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-black uppercase tracking-widest animate-pulse">
                             Processing
                           </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-medium break-all line-clamp-2">{startUrl}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {scan.status !== 'RUNNING' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-all hover:text-destructive hover:bg-destructive/10 h-9 w-9 rounded-full border border-transparent hover:border-destructive/20"
                            onClick={handleDelete}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground group-hover:text-destructive" />
                          </Button>
                      )}
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center group-hover/card:bg-primary/20 group-hover/card:text-primary transition-all">
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium min-w-0">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span className="truncate">{new Date(scan.createdAt).toLocaleDateString()} at {new Date(scan.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold shrink-0",
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
