import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { getLynxGeoDbName } from '@lynx/db';
import { geoAuthHttpStatus, requireGeoUser } from '@/lib/auth';
import { getGeoDb, postgresTarget } from '@/lib/db';
import { auditPages, auditSnapshots, audits } from '@/lib/db/schema';
import {
  buildMergedArticleDateCheck,
  fetchAndAnalyzeArticleDateCheck,
} from '@/lib/geo/apply-article-date-check';
import { needsNewsListingPrompt, parseCategoryScoresBlob } from '@/lib/geo/news-listing-prompt';
import { SCORE_MODEL_VERSION } from '@/lib/geo/score';
import { parseSnapshotPayload } from '@/lib/geo/snapshot';
import { DateCheckStartSchema } from '@/lib/validation';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireGeoUser();
    const { id } = await params;
    const body = DateCheckStartSchema.parse(await req.json());
    const geoDb = getGeoDb(session.id);
    const [source] = await geoDb
      .select()
      .from(audits)
      .where(and(eq(audits.id, id), eq(audits.userId, session.id)))
      .limit(1);
    if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (source.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Only completed audits can run a date check' }, { status: 409 });
    }

    const scores = parseCategoryScoresBlob(source.categoryScores);
    if (!needsNewsListingPrompt(scores)) {
      return NextResponse.json(
        { error: 'This audit does not need an article date check (or it was already handled)' },
        { status: 409 },
      );
    }

    const [snap] = await geoDb
      .select()
      .from(auditSnapshots)
      .where(eq(auditSnapshots.auditId, id))
      .orderBy(desc(auditSnapshots.createdAt))
      .limit(1);
    const snapshot = parseSnapshotPayload(snap?.payload);
    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not ready' }, { status: 409 });
    }

    const articleUrl = body.articleUrl;
    const analyzed = await fetchAndAnalyzeArticleDateCheck({
      articleUrl,
      auditId: id,
      configJson: source.config,
      log: (line) => console.log(`[geo] date-check ${id} ${line}`),
    });

    const merged = buildMergedArticleDateCheck({
      snapshot,
      pageFindings: analyzed.pageFindings,
      articleUrl: analyzed.articleUrl,
      pageStatus: analyzed.pageStatus,
      statusCode: analyzed.statusCode,
      contentType: analyzed.contentType,
      headers: analyzed.headers,
      previousCategoryBlob: scores,
    });

    const now = new Date();
    await geoDb.insert(auditPages).values({
      id: randomUUID(),
      auditId: id,
      url: merged.pageRow.url,
      parentUrl: null,
      status: merged.pageRow.status,
      statusCode: merged.pageRow.statusCode,
      depth: 0,
      contentType: merged.pageRow.contentType,
      headers: merged.pageRow.headers ? JSON.stringify(merged.pageRow.headers) : null,
      findings: JSON.stringify(merged.pageRow.findings),
      checkedAt: now,
    });

    await geoDb.insert(auditSnapshots).values({
      id: randomUUID(),
      auditId: id,
      score: merged.overall,
      scoreModelVersion: SCORE_MODEL_VERSION,
      payload: JSON.stringify(merged.snapshot),
      createdAt: now,
    });

    const [audit] = await geoDb
      .update(audits)
      .set({
        score: merged.overall,
        scoreModelVersion: SCORE_MODEL_VERSION,
        categoryScores: JSON.stringify(merged.categoryBlob),
        updatedAt: now,
      })
      .where(eq(audits.id, id))
      .returning();

    console.log(
      `[geo] date-check in-place audit=${id} article=${analyzed.articleUrl} score=${merged.overall} db=${getLynxGeoDbName(session.id)} postgres=${postgresTarget()}`,
    );

    return NextResponse.json({
      id,
      articleUrl: analyzed.articleUrl,
      score: merged.overall,
      audit,
      inPlace: true,
    });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'issues' in error) {
      return NextResponse.json({ error: 'Invalid article URL' }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Failed to run date check';
    return NextResponse.json({ error: message }, { status: geoAuthHttpStatus(error) });
  }
}
