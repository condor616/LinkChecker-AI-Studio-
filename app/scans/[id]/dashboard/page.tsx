import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { scans } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { ScanVisualDashboard } from '@/components/scan-visual-dashboard';
import { isTargetedScanConfig } from '@/lib/utils/url';

export default async function ScanDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const userDb = getDb(session.id);

  const scan = await userDb.select().from(scans).where(and(eq(scans.id, id), eq(scans.userId, session.id))).then(res => res[0]);
  if (!scan) notFound();

  // Targeted audits have no visual dashboard; do not render or compute it.
  if (isTargetedScanConfig(scan.config)) {
    redirect(`/scans/${id}`);
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-[1600px] mx-auto min-h-screen min-w-0">
      <ScanVisualDashboard scanId={scan.id} />
    </div>
  );
}
