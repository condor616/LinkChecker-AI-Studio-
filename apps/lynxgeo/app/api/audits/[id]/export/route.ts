import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireGeoUser } from '@/lib/auth';
import { getGeoDb } from '@/lib/db';
import { auditSnapshots, audits } from '@/lib/db/schema';
import { parseSnapshotPayload } from '@/lib/geo/snapshot';
import { snapshotToCsv, snapshotToHtml, snapshotToJson } from '@/lib/geo/export-report';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireGeoUser();
    const { id } = await params;
    const format = new URL(req.url).searchParams.get('format') || 'json';
    const geoDb = getGeoDb(session.id);
    const [audit] = await geoDb.select().from(audits).where(eq(audits.id, id)).limit(1);
    if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const [snap] = await geoDb.select().from(auditSnapshots).where(eq(auditSnapshots.auditId, id)).limit(1);
    const snapshot = parseSnapshotPayload(snap?.payload);
    if (!snapshot) return NextResponse.json({ error: 'Snapshot not ready' }, { status: 409 });

    if (format === 'csv') {
      return new NextResponse(snapshotToCsv(snapshot), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${id}.csv"`,
        },
      });
    }
    if (format === 'html') {
      return new NextResponse(snapshotToHtml(audit.name, audit.startUrl || '', snapshot), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="${id}.html"`,
        },
      });
    }
    return new NextResponse(snapshotToJson(audit.name, audit.startUrl || '', snapshot), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${id}.json"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
}
