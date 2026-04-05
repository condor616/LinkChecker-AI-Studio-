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
    <div className="p-8 max-w-[1600px] mx-auto space-y-10 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest">
            Scan Report
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">{scan.name}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-slate-400 font-medium">Status:</span>
            <span className={cn(
               "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
               scan.status === 'RUNNING' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
               scan.status === 'COMPLETED' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
               scan.status === 'FAILED' ? "bg-red-500/10 text-red-400 border-red-500/20" :
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

      <Suspense fallback={<div className="flex items-center justify-center p-20"><RefreshCw className="h-10 w-10 animate-spin text-primary/50" /></div>}>
        <ScanDashboard scanId={scan.id} initialStatus={scan.status} />
      </Suspense>
    </div>
  );
}
