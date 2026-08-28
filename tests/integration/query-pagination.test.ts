/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { processLink } from '@/lib/crawler/processor';
import { getDb } from '@/lib/db';
import { scans, links } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { canonicalizeScanUrl } from '@/lib/utils/url';

describe('Query-parameter listing traversal', () => {
    let server: any;
    let baseUrl: string;

    const db = () => getDb();

    beforeAll(async () => {
        const app = new Hono();

        app.get('/', (c) => c.html(`
            <html><body>
              <a href="/events">Events</a>
              <a href="/catalog">Catalog</a>
              <a href="/news/media-releases/press">Press</a>
              <a href="/en-us/about">About</a>
            </body></html>
        `));

        // Listing with tab links + pagination links (query params change the page).
        app.get('/events', (c) => {
            const filter = c.req.query('event_end_date') || '1';
            const page = c.req.query('page') || '0';
            const isPastPage3 = filter === '2' && page === '2';
            return c.html(`
                <html><head>
                  ${page === '0' && filter === '2' ? '<link rel="next" href="?event_end_date=2&page=1">' : ''}
                </head><body>
                  <a href="/events?event_end_date=1">Upcoming</a>
                  <a href="/events?event_end_date=2">Past Events</a>
                  <form action="/events" method="get">
                    <select name="event_end_date">
                      <option value="1" ${filter === '1' ? 'selected' : ''}>Upcoming</option>
                      <option value="2" ${filter === '2' ? 'selected' : ''}>Past</option>
                    </select>
                  </form>
                  ${filter === '2' && page === '0' ? '<a href="?event_end_date=2&page=1" rel="next">2</a>' : ''}
                  ${filter === '2' && page === '1' ? '<a href="?event_end_date=2&page=2" rel="next">3</a>' : ''}
                  ${isPastPage3 ? '<a href="/events/novartis-financial-results-q3-2025">Q3 2025</a>' : ''}
                  <a href="/about?utm_source=events&utm_campaign=nav">Tracked about</a>
                </body></html>
            `);
        });

        app.get('/events/novartis-financial-results-q3-2025', (c) => c.html(`
            <html><body>
              <a href="/files/report.pdf">Interim report</a>
            </body></html>
        `));

        // Generic listing: different path and param names.
        app.get('/catalog', (c) => {
            const color = c.req.query('color') || '';
            const page = c.req.query('page') || '1';
            return c.html(`
                <html><body>
                  <a href="/catalog?color=blue">Blue</a>
                  <a href="/catalog?color=red">Red</a>
                  ${color === 'blue' && page === '1' ? '<a rel="next" href="?color=blue&page=2">Next</a>' : ''}
                  ${color === 'blue' && page === '2' ? '<a href="/catalog/widget">Widget</a>' : ''}
                </body></html>
            `);
        });

        app.get('/catalog/widget', (c) => c.html(`
            <html><body>
              <a href="/files/report.pdf">Spec sheet</a>
            </body></html>
        `));

        app.get('/news/media-releases/press', (c) => c.html(`
            <html><body><a href="/files/report.pdf">Press PDF</a></body></html>
        `));

        app.get('/en-us/about', (c) => c.html(`<html><body><p>Locale</p></body></html>`));
        app.get('/about', (c) => c.html(`<html><body><p>About</p></body></html>`));

        app.get('/files/report.pdf', (c) => {
            return c.body('pdf', 200, { 'content-type': 'application/pdf' });
        });

        server = serve({ fetch: app.fetch, port: 0 });
        const address = await new Promise<any>((resolve) => {
            server.on('listening', () => resolve(server.address()));
        });
        baseUrl = `http://localhost:${address.port}`;
    });

    afterAll(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    function scanConfig() {
        const pdf = `${baseUrl}/files/report.pdf`;
        return {
            startUrl: baseUrl,
            maxDepth: 0,
            regexRules: [`${baseUrl.replace(/^https?:\/\//, '')}/[a-z]{2}-[a-z]{2}(/|$)`],
            wildcardExclusions: ['*/news/media-releases/*'],
            isTargeted: true,
            targetUrls: [pdf],
            skipExternal: true,
            excludeSubdomains: true,
            saveSkippedLinks: true,
        };
    }

    async function setupScan(config: any) {
        const scanId = crypto.randomUUID();
        await db().insert(scans).values({
            id: scanId,
            userId: `query-user-${crypto.randomUUID().slice(0, 8)}`,
            name: 'Query pagination scan',
            status: 'RUNNING',
            config: JSON.stringify(config),
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        return scanId;
    }

    async function crawlUntilIdle(scanId: string, config: any, seedUrl: string) {
        await db().insert(links).values({
            id: crypto.randomUUID(),
            scanId,
            url: seedUrl,
            status: 'PENDING',
            depth: 0,
        });

        const seen = new Set<string>();
        for (let i = 0; i < 40; i++) {
            const pending = await db().select().from(links).where(and(
                eq(links.scanId, scanId),
                eq(links.status, 'PENDING'),
            ));
            const next = pending.find((row) => !seen.has(row.id));
            if (!next) break;
            seen.add(next.id);
            await processLink(db(), next, { id: scanId, status: 'RUNNING' }, config);
        }
    }

    it('follows tab and pagination query links to discover a PDF parent', async () => {
        const config = scanConfig();
        const scanId = await setupScan(config);
        const pdf = canonicalizeScanUrl(`${baseUrl}/files/report.pdf`);
        const eventsPage = canonicalizeScanUrl(`${baseUrl}/events`);
        const pastEvents = canonicalizeScanUrl(`${baseUrl}/events?event_end_date=2`);
        const pastPage3 = canonicalizeScanUrl(`${baseUrl}/events?event_end_date=2&page=2`);
        const eventDetail = canonicalizeScanUrl(`${baseUrl}/events/novartis-financial-results-q3-2025`);
        const mediaRelease = canonicalizeScanUrl(`${baseUrl}/news/media-releases/press`);
        const localePage = canonicalizeScanUrl(`${baseUrl}/en-us/about`);

        await crawlUntilIdle(scanId, config, baseUrl);

        const all = await db().select().from(links).where(eq(links.scanId, scanId));
        const urls = all.map((row) => row.url);

        expect(urls).toContain(eventsPage);
        expect(urls).toContain(pastEvents);
        expect(urls).toContain(pastPage3);
        expect(all.find((row) => row.url === eventDetail)?.status).toBe('SUCCESS');

        const pdfParents = all.filter((row) => row.url === pdf).map((row) => row.parentUrl);
        expect(pdfParents).toContain(eventDetail);

        expect(all.find((row) => row.url === mediaRelease)?.status).toBe('SKIPPED');
        expect(all.find((row) => row.url === mediaRelease)?.error).toContain('Wildcard Rule');
        expect(all.find((row) => row.url === localePage)?.status).toBe('SKIPPED');
        expect(all.find((row) => row.url === localePage)?.error).toContain('Regex Rule');
    });

    it('follows generic listing filters and pagination with different param names', async () => {
        const config = scanConfig();
        const scanId = await setupScan(config);
        const pdf = canonicalizeScanUrl(`${baseUrl}/files/report.pdf`);
        const bluePage2 = canonicalizeScanUrl(`${baseUrl}/catalog?color=blue&page=2`);
        const widget = canonicalizeScanUrl(`${baseUrl}/catalog/widget`);

        await crawlUntilIdle(scanId, config, baseUrl);

        const all = await db().select().from(links).where(eq(links.scanId, scanId));
        expect(all.find((row) => row.url === bluePage2)?.status).toBe('SUCCESS');
        expect(all.find((row) => row.url === widget)?.status).toBe('SUCCESS');

        const pdfParents = all.filter((row) => row.url === pdf).map((row) => row.parentUrl);
        expect(pdfParents).toContain(widget);
    });

    it('does not enqueue tracking-query duplicates of the same page', async () => {
        const config = scanConfig();
        const scanId = await setupScan(config);
        await crawlUntilIdle(scanId, config, baseUrl);

        const all = await db().select().from(links).where(eq(links.scanId, scanId));
        const aboutUrls = all.filter((row) => row.url.includes('/about'));
        expect(aboutUrls.some((row) => /utm_/i.test(row.url))).toBe(false);
        expect(aboutUrls.some((row) => row.url === canonicalizeScanUrl(`${baseUrl}/about`))).toBe(true);
    });
});
