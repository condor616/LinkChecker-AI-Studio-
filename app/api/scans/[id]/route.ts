import { NextResponse } from 'next/server';
import { requireApprovedUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { scans, links } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApprovedUser();
    const { id } = await params;
    const userDb = getDb(session.id);

    const scan = await userDb.select().from(scans).where(and(eq(scans.id, id), eq(scans.userId, session.id))).then(res => res[0]);
    if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const scanLinks = await userDb.select().from(links).where(eq(links.scanId, id));

    return NextResponse.json({ scan, links: scanLinks });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApprovedUser();
    const { id } = await params;
    const userDb = getDb(session.id);

    // Verify it belongs to the user
    const scan = await userDb.select().from(scans).where(and(eq(scans.id, id), eq(scans.userId, session.id))).then(res => res[0]);
    if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Delete the scan (links will cascade)
    await userDb.delete(scans).where(eq(scans.id, id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
