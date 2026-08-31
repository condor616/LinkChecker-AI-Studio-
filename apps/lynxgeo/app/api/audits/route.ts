import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getLynxGeoDbName } from '@lynx/db';
import { geoAuthHttpStatus, requireGeoUser } from '@/lib/auth';
import { getGeoDb, postgresTarget } from '@/lib/db';
import { audits } from '@/lib/db/schema';
import { GEO_QUEUE, enqueueGeoAudit, redisTarget } from '@/lib/geo/queue';
import { forceGeoSkipExternal } from '@/lib/geo/origin-scope';
import { AuditStartSchema } from '@/lib/validation';
import { desc, eq } from 'drizzle-orm';

export async function GET() {
  try {
    const session = await requireGeoUser();
    const geoDb = getGeoDb(session.id);
    const rows = await geoDb.select().from(audits).where(eq(audits.userId, session.id)).orderBy(desc(audits.createdAt));
    return NextResponse.json({ audits: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireGeoUser();
    const body = AuditStartSchema.parse(await req.json());
    const id = randomUUID();
    const now = new Date();
    const geoDb = getGeoDb(session.id);
    const config = forceGeoSkipExternal({
      saveSkippedLinks: true,
      ...body,
    } as Record<string, unknown>);
    const auth = body.auth;
    if (!auth?.username?.trim() || !auth?.password?.trim()) {
      delete config.auth;
    }
    await geoDb.insert(audits).values({
      id,
      userId: session.id,
      name: body.name || `Audit ${new URL(body.startUrl).hostname}`,
      status: 'RUNNING',
      config: JSON.stringify(config),
      startUrl: body.startUrl,
      createdAt: now,
      updatedAt: now,
    });
    await enqueueGeoAudit(session.id, id);
    console.log(
      `[geo] inserted+enqueued audit ${id} db=${getLynxGeoDbName(session.id)} postgres=${postgresTarget()} redis=${redisTarget()} queue=${GEO_QUEUE} startUrl=${body.startUrl}`,
    );
    return NextResponse.json({ id });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid audit configuration', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: geoAuthHttpStatus(error) });
  }
}
