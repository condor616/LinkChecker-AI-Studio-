import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { geoAuthHttpStatus, requireGeoUser } from '@/lib/auth';
import { getGeoDb } from '@/lib/db';
import { auditPages, auditSnapshots, audits } from '@/lib/db/schema';
import { canTransitionAuditStatus } from '@/lib/geo/frontier';
import { enqueueGeoAudit } from '@/lib/geo/queue';
import { parseSnapshotPayload } from '@/lib/geo/snapshot';
import { AuditControlSchema } from '@/lib/validation';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireGeoUser();
    const { id } = await params;
    const geoDb = getGeoDb(session.id);
    const [audit] = await geoDb.select().from(audits).where(eq(audits.id, id)).limit(1);
    if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const pages = await geoDb.select().from(auditPages).where(eq(auditPages.auditId, id));
    const [snap] = await geoDb
      .select()
      .from(auditSnapshots)
      .where(eq(auditSnapshots.auditId, id))
      .orderBy(desc(auditSnapshots.createdAt))
      .limit(1);
    const snapshot = parseSnapshotPayload(snap?.payload);
    return NextResponse.json({ audit, pages, snapshot });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireGeoUser();
    const { id } = await params;
    const body = AuditControlSchema.parse(await req.json());
    const geoDb = getGeoDb(session.id);
    const [audit] = await geoDb
      .select()
      .from(audits)
      .where(and(eq(audits.id, id), eq(audits.userId, session.id)))
      .limit(1);
    if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!canTransitionAuditStatus(audit.status, body.status)) {
      return NextResponse.json(
        { error: `Cannot change status from ${audit.status} to ${body.status}` },
        { status: 409 },
      );
    }
    await geoDb
      .update(audits)
      .set({
        status: body.status,
        frontier: body.status === 'CANCELLED' ? null : audit.frontier,
        updatedAt: new Date(),
      })
      .where(eq(audits.id, id));
    if (body.status === 'RUNNING') {
      await enqueueGeoAudit(session.id, id);
    }
    const [updated] = await geoDb.select().from(audits).where(eq(audits.id, id)).limit(1);
    return NextResponse.json({ audit: updated });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && (error as { name?: string }).name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Failed to update audit';
    return NextResponse.json({ error: message }, { status: geoAuthHttpStatus(error) });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireGeoUser();
    const { id } = await params;
    const geoDb = getGeoDb(session.id);
    const [audit] = await geoDb
      .select({ id: audits.id })
      .from(audits)
      .where(and(eq(audits.id, id), eq(audits.userId, session.id)))
      .limit(1);
    if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await geoDb.delete(audits).where(eq(audits.id, id));
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete audit';
    return NextResponse.json({ error: message }, { status: geoAuthHttpStatus(error) });
  }
}
