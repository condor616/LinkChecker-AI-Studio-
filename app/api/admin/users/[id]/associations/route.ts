import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { scans, templates } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const userDb = getDb(id);

    const scanCount = await userDb.select({ count: sql`count(*)` }).from(scans).where(eq(scans.userId, id)).then(res => res[0]) as { count: number };
    const templateCount = await userDb.select({ count: sql`count(*)` }).from(templates).where(eq(templates.userId, id)).then(res => res[0]) as { count: number };

    return NextResponse.json({
      scans: scanCount?.count || 0,
      templates: templateCount?.count || 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
