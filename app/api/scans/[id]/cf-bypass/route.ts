import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { scans } from '@/lib/db/schema';
import { requireApprovedUser } from '@/lib/auth';
import { and, eq } from 'drizzle-orm';
import { enqueueManualCloudflareBypass } from '@/lib/crawler/enqueue-cf-bypass';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApprovedUser();
    const { id: scanId } = await params;
    const userDb = getDb(session.id);

    const scan = await userDb
      .select({ id: scans.id })
      .from(scans)
      .where(and(eq(scans.id, scanId), eq(scans.userId, session.id)))
      .then((rows) => rows[0]);
    if (!scan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
    }

    const result = await enqueueManualCloudflareBypass({
      userDb,
      userId: session.id,
      scanId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, count: result.count });
  } catch (error: any) {
    console.error('[CF Bypass Scan Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
