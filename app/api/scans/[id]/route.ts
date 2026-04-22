import { NextResponse } from 'next/server';
import { requireApprovedUser } from '@/lib/auth';
import { getDb, db as centralDb } from '@/lib/db';
import { scans, links, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApprovedUser();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const userDb = getDb(session.id);

    const scan = await userDb.select().from(scans).where(and(eq(scans.id, id), eq(scans.userId, session.id))).then(res => res[0]);
    if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let query = userDb.select().from(links).where(eq(links.scanId, id));
    
    if (search && search.length >= 3) {
      const { ilike, or } = await import('drizzle-orm');
      query = userDb.select().from(links).where(
        and(
          eq(links.scanId, id),
          or(
            ilike(links.url, `%${search}%`),
            ilike(links.parentUrl, `%${search}%`)
          )
        )
      );
    }

    const scanLinks = await query;

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

    // Reset user's active scan status in central DB if it was the last running scan
    // For simplicity, we just check if they have any other running scans
    const otherRunningScans = await userDb.select().from(scans).where(and(eq(scans.userId, session.id), eq(scans.status, 'RUNNING'))).limit(1);
    if (otherRunningScans.length === 0) {
      await centralDb.update(users).set({ hasActiveScan: false }).where(eq(users.id, session.id));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
