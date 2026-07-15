import { NextResponse } from 'next/server';
import { getDb, db as centralDb } from '@/lib/db';
import { links, scans, users } from '@/lib/db/schema';
import { requireApprovedUser } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';
import { scanQueue } from '@/lib/bullmq';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApprovedUser();
    const { id: scanId } = await params;
    const userDb = getDb(session.id);

    // Verify scan ownership
    const scan = await userDb.select().from(scans).where(and(eq(scans.id, scanId), eq(scans.userId, session.id))).then(res => res[0]);
    if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });

    // Find all broken links for this scan
    const brokenLinks = await userDb.select().from(links).where(and(
        eq(links.scanId, scanId),
        eq(links.status, 'BROKEN')
    ));

    if (brokenLinks.length === 0) {
        return NextResponse.json({ success: true, count: 0 });
    }

    // Mark as rechecked and PENDING in bulk
    await userDb.update(links).set({
        status: 'PENDING',
        statusCode: null,
        error: null,
        checkedAt: null,
        isRechecked: true,
    }).where(and(
        eq(links.scanId, scanId),
        eq(links.status, 'BROKEN')
    ));

    // Ensure scan is also RUNNING if it was in a terminal state
    if (['COMPLETED', 'FAILED', 'PAUSED', 'IDLE'].includes(scan.status)) {
        await userDb.update(scans).set({ status: 'RUNNING' }).where(eq(scans.id, scan.id));
        await centralDb.update(users).set({ hasActiveScan: true }).where(eq(users.id, session.id));
    }

    const config = typeof scan.config === 'string' ? JSON.parse(scan.config) : scan.config;

    // Enqueue all broken links
    for (const link of brokenLinks) {
        await scanQueue.add(`recheck-${link.id}`, {
            userId: session.id,
            scanId: scan.id,
            url: link.url,
            depth: link.depth,
            config,
            linkId: link.id
        });
    }

    return NextResponse.json({ success: true, count: brokenLinks.length });
  } catch (error: any) {
    console.error('[Recheck Broken Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
