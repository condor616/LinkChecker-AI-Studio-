import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { parseScanConfig } from '@lynx/crawler-core';
import { getLynxGeoDbName } from '@lynx/db';
import { geoAuthHttpStatus, requireGeoUser } from '@/lib/auth';
import { getGeoDb, postgresTarget } from '@/lib/db';
import { auditSnapshots, audits } from '@/lib/db/schema';
import { forceGeoSkipExternal } from '@/lib/geo/origin-scope';
import { enqueueGeoAudit, GEO_QUEUE, redisTarget } from '@/lib/geo/queue';
import { resolveBaselineAuditId, resolveSeriesId } from '@/lib/geo/series';
import { parseSnapshotPayload, pinnedTargetUrls } from '@/lib/geo/snapshot';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireGeoUser();
    const { id } = await params;
    const geoDb = getGeoDb(session.id);
    const [source] = await geoDb
      .select()
      .from(audits)
      .where(and(eq(audits.id, id), eq(audits.userId, session.id)))
      .limit(1);
    if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (source.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Only completed audits can be re-run' }, { status: 409 });
    }

    const [snap] = await geoDb
      .select()
      .from(auditSnapshots)
      .where(eq(auditSnapshots.auditId, id))
      .orderBy(desc(auditSnapshots.createdAt))
      .limit(1);
    const snapshot = parseSnapshotPayload(snap?.payload);
    if (!snapshot || snapshot.pages.length === 0) {
      return NextResponse.json({ error: 'Snapshot not ready or has no pages' }, { status: 409 });
    }

    const targetUrls = pinnedTargetUrls(snapshot);
    const baseConfig = forceGeoSkipExternal(parseScanConfig(source.config));
    const config = {
      ...baseConfig,
      isTargeted: true,
      targetUrls,
    };

    const newId = randomUUID();
    const now = new Date();
    const seriesId = resolveSeriesId(source);
    const baselineAuditId = resolveBaselineAuditId(source);

    await geoDb.insert(audits).values({
      id: newId,
      userId: session.id,
      name: `${source.name} (re-run)`,
      status: 'RUNNING',
      config: JSON.stringify(config),
      startUrl: source.startUrl,
      seriesId,
      baselineAuditId,
      createdAt: now,
      updatedAt: now,
    });
    await enqueueGeoAudit(session.id, newId);
    console.log(
      `[geo] rerun audit ${newId} from ${id} series=${seriesId} baseline=${baselineAuditId} pages=${targetUrls.length} db=${getLynxGeoDbName(session.id)} postgres=${postgresTarget()} redis=${redisTarget()} queue=${GEO_QUEUE}`,
    );
    return NextResponse.json({ id: newId, seriesId, baselineAuditId, pageCount: targetUrls.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to re-run audit';
    return NextResponse.json({ error: message }, { status: geoAuthHttpStatus(error) });
  }
}
