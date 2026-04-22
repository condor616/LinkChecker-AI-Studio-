import { NextResponse } from 'next/server';
import { requireApprovedUser } from '@/lib/auth';
import { getDb, db as centralDb } from '@/lib/db';
import { scans, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { scanQueue } from '@/lib/bullmq';
import { links } from '@/lib/db/schema';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApprovedUser();
    const { id } = await params;
    const { status } = await req.json();
    const userDb = getDb(session.id);

    const scan = await userDb.select().from(scans).where(and(eq(scans.id, id), eq(scans.userId, session.id))).then(res => res[0]);
    if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    console.log(`Updating scan ${id} status to ${status}`);
    await userDb.update(scans).set({ status, updatedAt: new Date() }).where(eq(scans.id, id));

    if (status === 'RUNNING') {
      console.log(`Resuming scan ${id}, enqueuing pending links...`);
      // Mark user as having an active scan in central DB
      await centralDb.update(users).set({ hasActiveScan: true }).where(eq(users.id, session.id));
      
      // Reset any stuck PROCESSING links back to PENDING
      await userDb.update(links).set({ status: 'PENDING' }).where(and(eq(links.scanId, id), eq(links.status, 'PROCESSING')));
      
      // Enqueue all pending links for this scan to ensure worker picks them up
      const pendingLinks = await userDb.select().from(links).where(and(eq(links.scanId, id), eq(links.status, 'PENDING')));
      console.log(`Found ${pendingLinks.length} pending links to enqueue.`);
      
      if (pendingLinks.length > 0) {
        const config = typeof scan.config === 'string' ? JSON.parse(scan.config) : scan.config;
        await scanQueue.addBulk(pendingLinks.map((l: any) => ({
          name: `scan-link-${l.id}`,
          data: { userId: session.id, scanId: id, url: l.url, depth: l.depth, config, linkId: l.id },
          opts: { jobId: `scan-link-${l.id}` } // Use jobId to avoid duplicates in the queue
        })));
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
