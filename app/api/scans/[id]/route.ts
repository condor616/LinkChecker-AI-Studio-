import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { scans, links } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const scan = db.select().from(scans).where(and(eq(scans.id, id), eq(scans.userId, session.id))).get();
    if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const scanLinks = db.select().from(links).where(eq(links.scanId, id)).all();

    return NextResponse.json({ scan, links: scanLinks });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
