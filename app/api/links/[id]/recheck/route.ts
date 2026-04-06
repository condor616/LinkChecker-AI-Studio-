import { NextResponse } from 'next/server';
import { getDb, db as centralDb } from '@/lib/db';
import { links, scans, users } from '@/lib/db/schema';
import { requireApprovedUser } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';
import { scanQueue } from '@/lib/bullmq';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApprovedUser();
    const { id } = await params;
    const userDb = getDb(session.id);

    // Get the link to check scan ownership
    const link = await userDb.select().from(links).where(eq(links.id, id)).then(res => res[0]);
    if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

    const scan = await userDb.select().from(scans).where(and(eq(scans.id, link.scanId), eq(scans.userId, session.id))).then(res => res[0]);
    if (!scan) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    // Reset all instances of this URL in this scan to PENDING and mark as rechecked
    await userDb.update(links).set({
      status: 'PENDING',
      statusCode: null,
      error: null,
      checkedAt: null,
      isRechecked: true,
    }).where(and(eq(links.scanId, scan.id), eq(links.url, link.url)));

    // Ensure scan is also RUNNING if it was COMPLETED
    if (scan.status === 'COMPLETED' || scan.status === 'FAILED' || scan.status === 'PAUSED') {
        await userDb.update(scans).set({ status: 'RUNNING' }).where(eq(scans.id, scan.id));
        // Mark user as having an active scan in central DB
        await centralDb.update(users).set({ hasActiveScan: true }).where(eq(users.id, session.id));
    }

    // Enqueue the specific link for recheck
    const config = typeof scan.config === 'string' ? JSON.parse(scan.config) : scan.config;
    await scanQueue.add(`scan-link-${link.id}`, {
      userId: session.id,
      scanId: scan.id,
      url: link.url,
      depth: link.depth,
      config,
      linkId: link.id
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
