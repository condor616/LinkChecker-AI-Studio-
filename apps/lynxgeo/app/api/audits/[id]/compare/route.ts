import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireGeoUser } from '@/lib/auth';
import { getGeoDb } from '@/lib/db';
import { auditSnapshots, audits } from '@/lib/db/schema';
import { groupPlaybook, SCORE_MODEL_VERSION } from '@/lib/geo/score';
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

    const diff = diffSnapshots(from, to);
    return NextResponse.json({
      from: { id: fromAudit.id, score: from.score, createdAt: fromAudit.createdAt, scoreModelVersion: from.scoreModelVersion },
      to: { id: toAudit.id, score: to.score, createdAt: toAudit.createdAt, scoreModelVersion: to.scoreModelVersion },
      scoreDelta: diff.scoreDelta,
      rubricChanged: diff.rubricChanged,
      resolved: diff.resolved,
      newIssues: diff.newIssues,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
}
