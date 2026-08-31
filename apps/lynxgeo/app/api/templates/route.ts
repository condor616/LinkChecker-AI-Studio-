import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { geoAuthHttpStatus, requireGeoUser } from '@/lib/auth';
import { getGeoDb } from '@/lib/db';
import { auditTemplates } from '@/lib/db/schema';
import { AuditTemplateSaveSchema } from '@/lib/validation';

function serializeConfig(config: string | Record<string, unknown>) {
  const parsed = typeof config === 'string' ? JSON.parse(config) : config;
  return JSON.stringify({ ...parsed, skipExternal: true, doNotTraverseBackward: true });
}

export async function GET() {
  try {
    const session = await requireGeoUser();
    const geoDb = getGeoDb(session.id);
    const rows = await geoDb
      .select()
      .from(auditTemplates)
      .where(eq(auditTemplates.userId, session.id))
      .orderBy(desc(auditTemplates.createdAt));
    return NextResponse.json(rows);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list templates';
    return NextResponse.json({ error: message }, { status: geoAuthHttpStatus(error) });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireGeoUser();
    const { name, config } = AuditTemplateSaveSchema.parse(await req.json());
    const geoDb = getGeoDb(session.id);
    const id = crypto.randomUUID();
    const row = {
      id,
      userId: session.id,
      name,
      config: serializeConfig(config),
      createdAt: new Date(),
    };
    await geoDb.insert(auditTemplates).values(row);
    return NextResponse.json({ id, name, createdAt: row.createdAt });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Config must be valid JSON' }, { status: 400 });
    }
    const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: string }).name) : '';
    if (name === 'ZodError') {
      return NextResponse.json({ error: 'Name and config required' }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Failed to save template';
    return NextResponse.json({ error: message }, { status: geoAuthHttpStatus(error) });
  }
}
