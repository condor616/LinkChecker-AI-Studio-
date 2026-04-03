import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { links, scans } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Get the link to check scan ownership
    const link = await db.select().from(links).where(eq(links.id, id)).then(res => res[0]);
    if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

    const scan = await db.select().from(scans).where(and(eq(scans.id, link.scanId), eq(scans.userId, session.id))).then(res => res[0]);
    if (!scan) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    // Reset all instances of this URL in this scan to PENDING and mark as rechecked
    await db.update(links).set({
      status: 'PENDING',
      statusCode: null,
      error: null,
      checkedAt: null,
      isRechecked: true,
    }).where(and(eq(links.scanId, scan.id), eq(links.url, link.url)));

    // Ensure scan is also RUNNING if it was COMPLETED
    if (scan.status === 'COMPLETED') {
        await db.update(scans).set({ status: 'RUNNING' }).where(eq(scans.id, scan.id));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
