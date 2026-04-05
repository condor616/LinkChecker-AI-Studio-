import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { processLink } from '@/lib/crawler/worker';
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
});
