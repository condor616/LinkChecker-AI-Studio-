import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { scans } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { ScanDashboard } from './scan-dashboard';
import { RefreshCw } from 'lucide-react';
import { Suspense } from 'react';
import { isTargetedScanConfig } from '@/lib/utils/url';

export default async function ScanDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const userDb = getDb(session.id);

  const scan = await userDb.select().from(scans).where(and(eq(scans.id, id), eq(scans.userId, session.id))).then(res => res[0]);
  if (!scan) notFound();

  return (
    <div className="max-w-[1600px] mx-auto min-h-screen">
      <Suspense fallback={<div className="flex items-center justify-center p-20"><RefreshCw className="h-10 w-10 animate-spin text-primary/50" /></div>}>
        <ScanDashboard
          scanId={scan.id}
          initialStatus={scan.status}
          scanName={scan.name}
          isTargetedScan={isTargetedScanConfig(scan.config)}
        />
      </Suspense>
    </div>
  );
}
