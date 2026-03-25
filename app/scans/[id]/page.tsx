import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { scans, links } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScanDashboard } from './scan-dashboard';

export default async function ScanDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;

  const scan = db.select().from(scans).where(and(eq(scans.id, id), eq(scans.userId, session.id))).get();
  if (!scan) notFound();

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{scan.name}</h1>
        <p className="text-muted-foreground mt-1">Status: <span className="capitalize font-medium">{scan.status.toLowerCase()}</span></p>
      </div>

      <ScanDashboard scanId={scan.id} initialStatus={scan.status} />
    </div>
  );
}
