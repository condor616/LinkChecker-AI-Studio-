import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getLynxGeoDbName } from '@lynx/db';
import { geoAuthHttpStatus, requireGeoUser } from '@/lib/auth';
import { getGeoDb, postgresTarget, db as centralDb } from '@/lib/db';
import { audits, users } from '@/lib/db/schema';
import { GEO_QUEUE, enqueueGeoAudit, redisTarget } from '@/lib/geo/queue';
import { forceGeoSkipExternal } from '@/lib/geo/origin-scope';
import { AuditStartSchema } from '@/lib/validation';
import { and, desc, eq, sql } from 'drizzle-orm';
import { enforceRateLimit, getClientIp } from '@/lib/security/rate-limit';

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
    const ip = getClientIp(req);
    const { limited, retryAfterSeconds } = enforceRateLimit(
      `audit:create:${session.id}:${ip}`,
      20,
      15 * 60 * 1000,
    );
    if (limited) {
      return NextResponse.json(
        { error: 'Too many audit requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      );
    }

    const body = AuditStartSchema.parse(await req.json());
    const geoDb = getGeoDb(session.id);

    const [userRow] = await centralDb
      .select({ maxJobs: users.maxJobs })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);
    const maxJobs = userRow?.maxJobs ?? 1;
    const [{ count: runningCount }] = await geoDb
      .select({ count: sql<number>`count(*)::int` })
      .from(audits)
      .where(and(eq(audits.userId, session.id), eq(audits.status, 'RUNNING')));
    if (Number(runningCount) >= maxJobs) {
      return NextResponse.json(
        {
          error: `Job limit reached (${maxJobs} concurrent audit${maxJobs === 1 ? '' : 's'}). Wait for an audit to finish or ask an admin to raise your limit.`,
        },
        { status: 429 },
      );
    }

    const id = randomUUID();
    const now = new Date();
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
      seriesId: id,
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
