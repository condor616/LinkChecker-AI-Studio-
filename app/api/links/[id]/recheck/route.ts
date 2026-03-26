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
    const link = db.select().from(links).where(eq(links.id, id)).get();
    if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

    const scan = db.select().from(scans).where(and(eq(scans.id, link.scanId), eq(scans.userId, session.id))).get();
    if (!scan) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    // Reset link status to PENDING
    db.update(links).set({
      status: 'PENDING',
      statusCode: null,
      error: null,
      checkedAt: null,
    }).where(eq(links.id, id)).run();

    // Ensure scan is also RUNNING if it was COMPLETED
    if (scan.status === 'COMPLETED') {
        db.update(scans).set({ status: 'RUNNING' }).where(eq(scans.id, scan.id)).run();
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
