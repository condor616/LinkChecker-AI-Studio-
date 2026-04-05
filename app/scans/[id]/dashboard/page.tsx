import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { scans } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { ScanVisualDashboard } from '@/components/scan-visual-dashboard';

export default async function ScanDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const userDb = getDb(session.id);

  const scan = await userDb.select().from(scans).where(and(eq(scans.id, id), eq(scans.userId, session.id))).then(res => res[0]);
  if (!scan) notFound();

  return (
    <div className="p-8 max-w-[1600px] mx-auto min-h-screen">
      <ScanVisualDashboard scanId={scan.id} />
    </div>
  );
}
