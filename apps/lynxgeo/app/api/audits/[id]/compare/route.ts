import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { requireGeoUser } from '@/lib/auth';
import { getGeoDb } from '@/lib/db';
import { auditSnapshots, audits } from '@/lib/db/schema';
import { groupPlaybook, SCORE_MODEL_VERSION } from '@/lib/geo/score';
import { configsMatchForCompare, resolveSeriesId, runLabelForIndex } from '@/lib/geo/series';
import { diffSnapshots, parseSnapshotPayload, type FrozenSnapshot } from '@/lib/geo/snapshot';

function fallbackSnapshot(audit: {
  score: number | null;
  scoreModelVersion: string | null;
  categoryScores: string | null;
}): FrozenSnapshot | null {
  try {
    const parsed = JSON.parse(audit.categoryScores || '{}');
    const playbook = Array.isArray(parsed.playbook) ? parsed.playbook : [];
    return {
      score: audit.score ?? 0,
      scoreModelVersion: audit.scoreModelVersion || SCORE_MODEL_VERSION,
      categories: {
        crawlAccess: parsed.crawlAccess ?? 0,
        extractability: parsed.extractability ?? 0,
        negotiation: parsed.negotiation ?? 0,
        discovery: parsed.discovery ?? 0,
        citeability: parsed.citeability ?? 0,
      },
      findings: playbook,
      playbook: groupPlaybook(playbook),
      pages: [],
      frozenAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function loadSnapshot(geoDb: ReturnType<typeof getGeoDb>, auditId: string): Promise<FrozenSnapshot | null> {
  const snaps = await geoDb.select().from(auditSnapshots).where(eq(auditSnapshots.auditId, auditId)).limit(1);
  const frozen = parseSnapshotPayload(snaps[0]?.payload);
  if (frozen) return frozen;
  const [audit] = await geoDb.select().from(audits).where(eq(audits.id, auditId)).limit(1);
  return audit ? fallbackSnapshot(audit) : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireGeoUser();
    const { id } = await params;
    const otherId = new URL(req.url).searchParams.get('other');
    if (!otherId) return NextResponse.json({ error: 'other query param required' }, { status: 400 });

    const geoDb = getGeoDb(session.id);
    const [fromAudit] = await geoDb.select().from(audits).where(eq(audits.id, id)).limit(1);
    const [toAudit] = await geoDb.select().from(audits).where(eq(audits.id, otherId)).limit(1);
    if (!fromAudit || !toAudit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

    const from = await loadSnapshot(geoDb, id);
    const to = await loadSnapshot(geoDb, otherId);
    if (!from || !to) return NextResponse.json({ error: 'Snapshots not ready' }, { status: 409 });

    const configChanged = !configsMatchForCompare(fromAudit.config, toAudit.config);
    const diff = diffSnapshots(from, to, { configChanged });

    const seriesId = resolveSeriesId(fromAudit);
    const allAudits = await geoDb
      .select()
      .from(audits)
      .where(eq(audits.userId, session.id))
      .orderBy(asc(audits.createdAt));
    const seriesRuns = allAudits
      .filter((row) => resolveSeriesId(row) === seriesId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    function runLabelForAudit(auditId: string): string {
      const idx = seriesRuns.findIndex((r) => r.id === auditId);
      if (idx < 0) return 'Unknown';
      return runLabelForIndex(seriesRuns[idx], idx);
    }

    return NextResponse.json({
      from: {
        id: fromAudit.id,
        name: fromAudit.name,
        score: from.score,
        createdAt: fromAudit.createdAt,
        scoreModelVersion: from.scoreModelVersion,
        pageCount: from.pages.length,
        runLabel: runLabelForAudit(fromAudit.id),
      },
      to: {
        id: toAudit.id,
        name: toAudit.name,
        score: to.score,
        createdAt: toAudit.createdAt,
        scoreModelVersion: to.scoreModelVersion,
        pageCount: to.pages.length,
        runLabel: runLabelForAudit(toAudit.id),
      },
      ...diff,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
}
