import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { scans, links } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScanDashboard } from './scan-dashboard';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { LayoutDashboard, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Suspense } from 'react';
import { ExportButton } from './export-button';

export default async function ScanDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const userDb = getDb(session.id);

  const scan = await userDb.select().from(scans).where(and(eq(scans.id, id), eq(scans.userId, session.id))).then(res => res[0]);
  if (!scan) notFound();

  return (
    <div className="max-w-[1600px] mx-auto min-h-screen">
      <div className="sticky top-16 z-30 bg-background/95 backdrop-blur-sm border-b border-border px-8 py-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest">
              Scan Report
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground">{scan.name}</h1>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm font-medium">Status:</span>
              <span className={cn(
                 "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                 scan.status === 'RUNNING' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                 scan.status === 'COMPLETED' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                 scan.status === 'FAILED' ? "bg-destructive/10 text-destructive border-destructive/20" :
                 "bg-slate-500/10 text-slate-400 border-slate-500/20"
              )}>
                {scan.status}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ExportButton scanId={scan.id} scanName={scan.name} />
            <Button asChild variant="outline" className="gap-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-all">
              <Link href={`/scans/${id}/dashboard`}>
                <LayoutDashboard className="h-4 w-4 text-primary" />
                Visual Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="px-8 pt-8 pb-10 space-y-8">
        <Suspense fallback={<div className="flex items-center justify-center p-20"><RefreshCw className="h-10 w-10 animate-spin text-primary/50" /></div>}>
          <ScanDashboard scanId={scan.id} initialStatus={scan.status} />
        </Suspense>
      </div>
    </div>
  );
}
