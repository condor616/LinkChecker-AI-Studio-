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
              <Card className="hover:bg-white/[0.04] transition-all duration-300 cursor-pointer border border-white/5 hover:border-primary/30 group/card relative overflow-hidden h-full glass-vibrant hover:shadow-[0_0_20px_rgba(168,85,247,0.1)]">
                <div className={cn(
                  "absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 group-hover/card:w-1.5",
                  scan.status === 'RUNNING' ? "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" :
                  scan.status === 'COMPLETED' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" :
                  scan.status === 'FAILED' ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" :
                  "bg-slate-500"
                )} />
                <CardContent className="p-6 flex items-center justify-between">
                  <div className="space-y-2 min-w-0 pr-8">
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-lg truncate text-white group-hover/card:text-primary transition-colors">{scan.name}</h3>
                      {scan.status === 'RUNNING' && (
                         <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-black uppercase tracking-widest animate-pulse">
                           Processing
                         </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(scan.createdAt).toLocaleDateString()} at {new Date(scan.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-slate-600">•</span>
                      <span className="truncate max-w-[200px] md:max-w-md">{startUrl}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right hidden md:block">
                      <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] mb-1.5">Engine Status</p>
                      <div className={cn(
                          "flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold",
                          scan.status === 'RUNNING' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                          scan.status === 'COMPLETED' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          scan.status === 'FAILED' ? "bg-red-500/10 text-red-400 border-red-500/20" :
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
                        className="opacity-0 group-hover:opacity-100 transition-all hover:text-red-400 hover:bg-red-500/10 h-10 w-10 rounded-full border border-transparent hover:border-red-500/20 shrink-0"
                        onClick={handleDelete}
                      >
                        <Trash2 className="h-5 w-5 text-slate-500 group-hover:text-red-400" />
                      </Button>
                  )}

                  <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center group-hover/card:bg-primary/20 group-hover/card:text-primary transition-all shrink-0">
                    <ChevronRight className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          </div>
        </motion.div>

        {showConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-card border rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in duration-200">
                    <div className="flex items-center gap-3 text-red-600">
                         <div className="p-2 bg-red-100 rounded-full">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <h3 className="text-lg font-bold">Delete Scan?</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Are you sure you want to delete <span className="font-bold text-foreground">"{scan.name}"</span>? All link results will be permanently removed.
                    </p>
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)} disabled={isDeleting}>Cancel</Button>
                        <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={isDeleting}>
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Delete Scan'}
                        </Button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
