'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, CheckCircle, AlertCircle, Clock, ChevronRight, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import * as motion from 'motion/react-client';
import { useRouter } from 'next/navigation';

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
              <Card className="hover:bg-muted/50 transition-all hover:shadow-md cursor-pointer border-l-4 border-l-transparent dark:hover:border-l-primary/50 h-full">
                <CardContent className="p-6 flex items-center justify-between">
                  <div className="space-y-1 min-w-0 pr-8">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg truncate">{scan.name}</h3>
                      {scan.status === 'RUNNING' && (
                         <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                           Live
                         </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {startUrl} • Started {new Date(scan.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                  <div className="text-right hidden sm:block">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Status</p>
                      <div className="flex items-center gap-2 mt-1">
                          {scan.status === 'RUNNING' && <Activity className="h-4 w-4 text-blue-500 animate-pulse" />}
                          {scan.status === 'COMPLETED' && <CheckCircle className="h-4 w-4 text-emerald-500" />}
                          {scan.status === 'FAILED' && <AlertCircle className="h-4 w-4 text-red-500" />}
                          {scan.status === 'IDLE' && <Clock className="h-4 w-4 text-muted-foreground" />}
                          <span className="text-sm font-medium capitalize">{scan.status.toLowerCase()}</span>
                      </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
          
          {scan.status !== 'RUNNING' && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500 hover:bg-red-50 h-8 w-8"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
          )}
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
