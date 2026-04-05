import { NextResponse } from 'next/server';
import { requireApprovedUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { scans, links } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { filterAndGroupLinks, generateCSV, generateJSON, generateHTML } from '@/lib/utils/export-utils';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await requireApprovedUser();
        const { id } = await params;
        const { searchParams } = new URL(req.url);
        const format = searchParams.get('format') || 'json';
        const filter = searchParams.get('filter') || 'all'; // all, broken

        const userDb = getDb(session.id);

        // STRICTOR SECURITY: Verify the scan belongs to the user
        const scan = await userDb.select().from(scans).where(
            and(
                eq(scans.id, id),
                eq(scans.userId, session.id)
            )
        ).then(res => res[0]);

        if (!scan) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

        // Fetch all links for this scan
        const allLinks = await userDb.select().from(links).where(eq(links.scanId, id));

        // Apply shared filtering and grouping logic
        const config = JSON.parse(scan.config || '{}');
        let groupedLinks = filterAndGroupLinks(allLinks, config);

        // Apply additional filter if requested
        if (filter === 'broken') {
            groupedLinks = groupedLinks.filter(g => g.status === 'BROKEN');
        }

        let content: string;
        let contentType: string;
        let filename: string;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseName = `link-report-${scan.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${timestamp}`;

        switch (format) {
            case 'csv':
                content = generateCSV(groupedLinks);
                contentType = 'text/csv';
                filename = `${baseName}.csv`;
                break;
            case 'html':
                content = generateHTML(scan, groupedLinks);
                contentType = 'text/html';
                filename = `${baseName}.html`;
                break;
            case 'json':
            default:
                content = generateJSON(scan, allLinks); // JSON usually contains raw data
                contentType = 'application/json';
                filename = `${baseName}.json`;
                break;
        }

        return new NextResponse(content, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error: any) {
        console.error('Export error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
