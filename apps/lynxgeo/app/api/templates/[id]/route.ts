import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { geoAuthHttpStatus, requireGeoUser } from '@/lib/auth';
import { getGeoDb } from '@/lib/db';
import { auditTemplates } from '@/lib/db/schema';
import { AuditTemplateSaveSchema } from '@/lib/validation';

function serializeConfig(config: string | Record<string, unknown>) {
  const parsed = typeof config === 'string' ? JSON.parse(config) : config;
  return JSON.stringify({ ...parsed, skipExternal: true, doNotTraverseBackward: true });
}

async function ownedTemplate(userId: string, id: string) {
  const geoDb = getGeoDb(userId);
  const [row] = await geoDb
    .select()
    .from(auditTemplates)
    .where(and(eq(auditTemplates.id, id), eq(auditTemplates.userId, userId)))
    .limit(1);
  return { geoDb, row };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireGeoUser();
    const { id } = await params;
    const { row } = await ownedTemplate(session.id, id);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(row);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load template';
    return NextResponse.json({ error: message }, { status: geoAuthHttpStatus(error) });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireGeoUser();
    const { id } = await params;
    const { name, config } = AuditTemplateSaveSchema.parse(await req.json());
    const { geoDb, row } = await ownedTemplate(session.id, id);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await geoDb
      .update(auditTemplates)
      .set({ name, config: serializeConfig(config) })
      .where(and(eq(auditTemplates.id, id), eq(auditTemplates.userId, session.id)));
    return NextResponse.json({ success: true, id, name });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Config must be valid JSON' }, { status: 400 });
    }
    const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: string }).name) : '';
    if (name === 'ZodError') {
      return NextResponse.json({ error: 'Name and config required' }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Failed to update template';
    return NextResponse.json({ error: message }, { status: geoAuthHttpStatus(error) });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireGeoUser();
    const { id } = await params;
    const { geoDb, row } = await ownedTemplate(session.id, id);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await geoDb.delete(auditTemplates).where(and(eq(auditTemplates.id, id), eq(auditTemplates.userId, session.id)));
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete template';
    return NextResponse.json({ error: message }, { status: geoAuthHttpStatus(error) });
  }
}
