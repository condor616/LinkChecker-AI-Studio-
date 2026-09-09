import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { links, scans } from '@/lib/db/schema';
import { requireApprovedUser } from '@/lib/auth';
import { and, eq } from 'drizzle-orm';
import { enqueueManualCloudflareBypass } from '@/lib/crawler/enqueue-cf-bypass';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApprovedUser();
    const { id } = await params;
    const userDb = getDb(session.id);

    const link = await userDb.select().from(links).where(eq(links.id, id)).then((rows) => rows[0]);
    if (!link) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    const scan = await userDb
      .select()
      .from(scans)
      .where(and(eq(scans.id, link.scanId), eq(scans.userId, session.id)))
      .then((rows) => rows[0]);
    if (!scan) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (link.status !== 'CHALLENGED') {
      return NextResponse.json(
        { error: 'Only Cloudflare-challenged links can be retried with FlareSolverr.' },
        { status: 400 },
      );
    }

    const result = await enqueueManualCloudflareBypass({
      userDb,
      userId: session.id,
      scanId: scan.id,
      urls: [link.url],
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, count: result.count });
  } catch (error: any) {
    console.error('[CF Bypass Link Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
