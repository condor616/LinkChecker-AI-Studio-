// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { processLink } from '@/lib/crawler/processor';
import { db } from '@/lib/db';
import { scans, links, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

describe('Crawler Link Processing', () => {
  let server: any;
  let baseUrl: string;

  beforeAll(async () => {
    const app = new Hono();
    
    app.get('/success', (c) => c.html('<html><body><a href="/broken">Broken</a></body></html>'));
    app.get('/broken', (c) => c.text('Not Found', 404));
    app.get('/external', (c) => c.redirect('https://google.com'));
    app.get('/drupal-pollution', (c) => c.html(`
      <html>
        <body>
          <a href="/index%2ephp/about">About</a>
          <a href="/index.php/contact">Contact</a>
          <a href="/index%2Ephp/careers">Careers</a>
          <a href="/some/path/index.php/not-normalized">Sub path</a>
        </body>
      </html>
    `));
    app.get('/quarterly', (c) => c.html(`
      <html>
        <body>
          <ul>
            <li><a href="#tabq3-2025-17051">Q3 2025</a></li>
            <li><a href="/quarterly#tabannual-results">Annual</a></li>
          </ul>
          <div id="tabq3-2025-17051">
            <a href="/files/q3-report.pdf">Q3 Report</a>
          </div>
          <div id="tabannual-results">
            <a href="/files/annual-report.pdf">Annual Report</a>
          </div>
        </body>
      </html>
    `));
    app.get('/home', (c) => c.html('<html><body><a href="/quarterly">Quarterly results</a></body></html>'));
    app.get('/files/q3-report.pdf', () => new Response('pdf', { status: 200, headers: { 'Content-Type': 'application/pdf' } }));
    app.get('/files/annual-report.pdf', () => new Response('pdf', { status: 200, headers: { 'Content-Type': 'application/pdf' } }));

    // Use port 0 for dynamic port assignment
    server = serve({ fetch: app.fetch, port: 0 });
    
    // Wait for server to start and get the port
    const address = await new Promise<any>((resolve) => {
        server.on('listening', () => resolve(server.address()));
    });
    
    baseUrl = `http://localhost:${address.port}`;
    console.log(`Mock server running at ${baseUrl}`);
  });

  afterAll(async () => {
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
  });

  const TEST_USER_ID = 'crawler_test_user';
  const TEST_SCAN_ID = 'crawler_test_scan';

  beforeEach(async () => {
    // Surgical cleanup of test data for this file only
    await db.delete(links).where(eq(links.scanId, TEST_SCAN_ID));
    await db.delete(scans).where(eq(scans.id, TEST_SCAN_ID));
    await db.delete(users).where(eq(users.id, TEST_USER_ID));


    // Setup a mock user and scan
    await db.insert(users).values({
        id: TEST_USER_ID,
        email: 'test@example.com',
        passwordHash: 'hash',
        role: 'USER',
        createdAt: new Date(),
    });


    await db.insert(scans).values({
        id: TEST_SCAN_ID,
        userId: TEST_USER_ID,
        name: 'Test Scan',
        status: 'RUNNING',
        config: JSON.stringify({ startUrl: baseUrl, maxDepth: 2 }),
        createdAt: new Date(),
        updatedAt: new Date(),
    });


  });

  it('marks a 200 OK link as SUCCESS and extracts new links', async () => {
    const link = {
        id: crypto.randomUUID(),
        scanId: TEST_SCAN_ID,
        url: `${baseUrl}/success`,
        status: 'PENDING',
        depth: 0,
    };


    // Insert the initial link
    await db.insert(links).values(link);

    const scan = await db.select().from(scans).where(eq(scans.id, TEST_SCAN_ID)).then(res => res[0]);

    const config = JSON.parse(scan?.config as string);

    await processLink(db, link, scan, config);

    // Verify the link status updated
    const updatedLink = await db.select().from(links).where(eq(links.url, link.url)).then(res => res[0]);
    expect(updatedLink?.status).toBe('SUCCESS');
    expect(updatedLink?.statusCode).toBe(200);

    // Verify a new link was found
    const foundLink = await db.select().from(links).where(eq(links.url, `${baseUrl}/broken`)).then(res => res[0]);
    expect(foundLink).toBeDefined();
    expect(foundLink?.status).toBe('PENDING');
    expect(foundLink?.parentUrl).toBe(link.url);
  });

  it('marks a 404 link as BROKEN', async () => {
    const link = {
        id: crypto.randomUUID(),
        scanId: TEST_SCAN_ID,
        url: `${baseUrl}/broken`,
        status: 'PENDING',
        depth: 1,
    };


    await db.insert(links).values(link);

    const scan = await db.select().from(scans).where(eq(scans.id, TEST_SCAN_ID)).then(res => res[0]);

    const config = JSON.parse(scan?.config as string);

    await processLink(db, link, scan, config);

    const updatedLink = await db.select().from(links).where(eq(links.url, link.url)).then(res => res[0]);
    expect(updatedLink?.status).toBe('BROKEN');
    expect(updatedLink?.statusCode).toBe(404);
  });

  it('normalizes out Drupal/PHP front controllers from extracted links', async () => {
    const link = {
        id: crypto.randomUUID(),
        scanId: TEST_SCAN_ID,
        url: `${baseUrl}/drupal-pollution`,
        status: 'PENDING',
        depth: 0,
    };

    await db.insert(links).values(link);

    const scan = await db.select().from(scans).where(eq(scans.id, TEST_SCAN_ID)).then(res => res[0]);
    const config = JSON.parse(scan?.config as string);

    await processLink(db, link, scan, config);

    // Verify all enqueued links
    const allLinks = await db.select().from(links).where(eq(links.scanId, TEST_SCAN_ID));
    
    // Check that we normalized:
    // /index%2ephp/about -> /about
    // /index.php/contact -> /contact
    // /index%2Ephp/careers -> /careers
    // But kept /some/path/index.php/not-normalized as-is
    
    const urls = allLinks.map(l => l.url);
    
    expect(urls).toContain(`${baseUrl}/about`);
    expect(urls).toContain(`${baseUrl}/contact`);
    expect(urls).toContain(`${baseUrl}/careers`);
    expect(urls).toContain(`${baseUrl}/some/path/index.php/not-normalized`);
    
    // Ensure none of the index.php/index%2ephp polluted links were enqueued at the root
    expect(urls).not.toContain(`${baseUrl}/index%2ephp/about`);
    expect(urls).not.toContain(`${baseUrl}/index.php/contact`);
    expect(urls).not.toContain(`${baseUrl}/index%2Ephp/careers`);
  });

  it('attributes in-tab PDFs to the fragment parent and does not enqueue hash URLs', async () => {
    const quarterlyUrl = `${baseUrl}/quarterly`;
    const q3Fragment = `${quarterlyUrl}#tabq3-2025-17051`;
    const q3Pdf = `${baseUrl}/files/q3-report.pdf`;
    const annualPdf = `${baseUrl}/files/annual-report.pdf`;

    const link = {
        id: crypto.randomUUID(),
        scanId: TEST_SCAN_ID,
        url: quarterlyUrl,
        status: 'PENDING',
        depth: 0,
    };
    await db.insert(links).values(link);

    const scan = await db.select().from(scans).where(eq(scans.id, TEST_SCAN_ID)).then(res => res[0]);
    const config = JSON.parse(scan?.config as string);

    const newLinks = await processLink(db, link, scan, config) as any[] | undefined;

    const allLinks = await db.select().from(links).where(eq(links.scanId, TEST_SCAN_ID));
    const q3Hits = allLinks.filter(l => l.url === q3Pdf);
    expect(q3Hits.some(l => l.parentUrl === q3Fragment)).toBe(true);

    const annualHits = allLinks.filter(l => l.url === annualPdf);
    expect(annualHits.some(l => l.parentUrl === `${quarterlyUrl}#tabannual-results`)).toBe(true);

    const queuedUrls = (newLinks || []).map(l => l.url);
    expect(queuedUrls.some((url: string) => url.includes('#'))).toBe(false);
  });

  it('discovers a targeted PDF inside a tab from the start page', async () => {
    const homeUrl = `${baseUrl}/home`;
    const q3Pdf = `${baseUrl}/files/q3-report.pdf`;
    const q3Fragment = `${baseUrl}/quarterly#tabq3-2025-17051`;
    const config = {
        startUrl: homeUrl,
        isTargeted: true,
        targetUrls: [q3Pdf],
        maxDepth: 0,
    };

    await db.update(scans).set({ config: JSON.stringify(config) }).where(eq(scans.id, TEST_SCAN_ID));

    const homeLink = {
        id: crypto.randomUUID(),
        scanId: TEST_SCAN_ID,
        url: homeUrl,
        status: 'PENDING',
        depth: 0,
    };
    await db.insert(links).values(homeLink);

    const scan = await db.select().from(scans).where(eq(scans.id, TEST_SCAN_ID)).then(res => res[0]);
    const fromHome = await processLink(db, homeLink, scan, config) as any[] | undefined;
    const quarterlyJob = (fromHome || []).find((l: any) => l.url === `${baseUrl}/quarterly`);
    expect(quarterlyJob).toBeDefined();

    const fromQuarterly = await processLink(db, quarterlyJob, scan, config) as any[] | undefined;

    const allLinks = await db.select().from(links).where(eq(links.scanId, TEST_SCAN_ID));
    const pdfHits = allLinks.filter(l => l.url === q3Pdf);
    expect(pdfHits.length).toBeGreaterThan(0);
    expect(pdfHits.some(l => l.parentUrl === q3Fragment)).toBe(true);

    const queuedUrls = (fromQuarterly || []).map((l: any) => l.url);
    expect(queuedUrls).toContain(q3Pdf);
    expect(queuedUrls.some((url: string) => url.includes('#'))).toBe(false);
  });

  it('records a fragment target when the tab id exists on the page', async () => {
    const quarterlyUrl = `${baseUrl}/quarterly`;
    const fragmentTarget = `${quarterlyUrl}#tabq3-2025-17051`;
    const config = {
        startUrl: quarterlyUrl,
        isTargeted: true,
        targetUrls: [fragmentTarget],
        maxDepth: 0,
    };

    await db.update(scans).set({ config: JSON.stringify(config) }).where(eq(scans.id, TEST_SCAN_ID));

    const link = {
        id: crypto.randomUUID(),
        scanId: TEST_SCAN_ID,
        url: quarterlyUrl,
        status: 'PENDING',
        depth: 0,
    };
    await db.insert(links).values(link);

    const scan = await db.select().from(scans).where(eq(scans.id, TEST_SCAN_ID)).then(res => res[0]);
    const newLinks = await processLink(db, link, scan, config) as any[] | undefined;

    const fragmentRow = await db.select().from(links).where(and(
        eq(links.scanId, TEST_SCAN_ID),
        eq(links.url, fragmentTarget)
    )).then(res => res[0]);

    expect(fragmentRow).toBeDefined();
    expect(fragmentRow.status).toBe('SUCCESS');
    expect(fragmentRow.statusCode).toBe(200);
    expect((newLinks || []).some((l: any) => l.url.includes('#'))).toBe(false);
  });
});
