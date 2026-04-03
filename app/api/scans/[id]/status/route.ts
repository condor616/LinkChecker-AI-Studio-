import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { scans } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { startWorker } from '@/lib/crawler/worker';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const { status } = await req.json();

    const scan = await db.select().from(scans).where(and(eq(scans.id, id), eq(scans.userId, session.id))).then(res => res[0]);
    if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await db.update(scans).set({ status, updatedAt: new Date() }).where(eq(scans.id, id));

    if (status === 'RUNNING') {
      startWorker();
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
