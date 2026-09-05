// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { port, startMockServer } from '../../scripts/serve-mock-site';
import { processLink } from '@/lib/crawler/processor';
import { getDb } from '../../lib/db';
import { scans, links } from '../../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

describe('Skipped Links Feature Verification', () => {
    const baseUrl = `http://localhost:${port}`;
    const testDb = getDb();

    beforeAll(async () => {
        await startMockServer();
    });

    async function setupScan(config: any) {
        const scanId = crypto.randomUUID();
        const userId = `skip-user-${crypto.randomUUID().slice(0, 8)}`;
        await testDb.insert(scans).values({
            id: scanId,
            userId: userId,
            name: 'Skipped Links Test Scan',
            status: 'RUNNING',
            config: JSON.stringify(config),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return scanId;
    }

    it('should record skipped links when saveSkippedLinks is true (Regex)', async () => {
        const config = {
            startUrl: baseUrl,
            saveSkippedLinks: true,
            regexRules: ['it-it'] // Match it-it in the URL
        };
        const scanId = await setupScan(config);
        
        // The index page contains link to /it-it/
        const link = { url: baseUrl, scanId, depth: 0, status: 'PENDING' };
        
        const newLinks = await processLink(testDb, link, { id: scanId }, config);
        
        // Find the skipped link in the DB
        const skippedLink = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.status, 'SKIPPED')
        )).then(res => res[0]);
        
        expect(skippedLink).toBeDefined();
        expect(skippedLink?.url).toContain('/it-it');
        expect(skippedLink?.error).toContain('Regex Rule: it-it'); // New error msg format
        
        // Ensure it's NOT in the returned newLinks list (so it's not queued for worker)
        const inNewLinks = newLinks?.find(l => l.url === skippedLink?.url);
        expect(inNewLinks).toBeUndefined();
    });

    it('should NOT record skipped links when saveSkippedLinks is false (Regex)', async () => {
        const config = {
            startUrl: baseUrl,
            saveSkippedLinks: false,
            regexRules: ['/it-it/']
        };
        const scanId = await setupScan(config);
        
        const link = { url: baseUrl, scanId, depth: 0, status: 'PENDING' };
        await processLink(testDb, link, { id: scanId }, config);
        
        const skippedLinks = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.status, 'SKIPPED')
        ));
        
        expect(skippedLinks.length).toBe(0);
    });

    it('should verify external links and keep SUCCESS status when skipExternal is true', async () => {
        const config = {
            startUrl: baseUrl,
            saveSkippedLinks: true,
            skipExternal: true
        };
        const scanId = await setupScan(config);
        const externalUrl = `http://127.0.0.1:${port}/`;

        await testDb.insert(links).values({
            id: crypto.randomUUID(),
            scanId,
            url: externalUrl,
            status: 'PENDING',
            depth: 1
        });

        const externalPending = { url: externalUrl, scanId, depth: 1, status: 'PENDING' };

        // Now process that external link
        await processLink(testDb, externalPending, { id: scanId }, config);

        // Check it was verified (SUCCESS) and tagged with traversal reason
        const result = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.url, externalUrl)
        )).then(res => res[0]);

        expect(result.status).toBe('SUCCESS');
        expect(result.error).toContain('External link (Verified)');
    });

    it('should verify external links and mark them BROKEN if they fail', async () => {
        const config = {
            startUrl: baseUrl,
            saveSkippedLinks: true,
            skipExternal: true
        };
        const scanId = await setupScan(config);
        
        // Mock a broken external link (using 127.0.0.1 to make it "external" to localhost)
        const brokenUrl = `http://127.0.0.1:${port}/external-broken`;
        
        // Add it to the DB manually since we want to test its processing
        await testDb.insert(links).values({
            id: crypto.randomUUID(),
            scanId,
            url: brokenUrl,
            status: 'PENDING',
            depth: 1
        });

        const link = { url: brokenUrl, scanId, depth: 1, status: 'PENDING' };
        await processLink(testDb, link, { id: scanId }, config);

        // Check it was marked as BROKEN
        const result = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.url, brokenUrl)
        )).then(res => res[0]);

        expect(result.status).toBe('BROKEN');
        expect(result.statusCode).toBe(404);
    });

    it('should keep verified external links even if saveSkippedLinks is false', async () => {
        const config = {
            startUrl: baseUrl,
            saveSkippedLinks: false,
            skipExternal: true
        };
        const scanId = await setupScan(config);
        
        // Use a working external link (google.com might work but let's use our mock site with 127.0.0.1)
        const workingUrl = `http://127.0.0.1:${port}/`;
        
        await testDb.insert(links).values({
            id: crypto.randomUUID(),
            scanId,
            url: workingUrl,
            status: 'PENDING',
            depth: 1
        });

        const link = { url: workingUrl, scanId, depth: 1, status: 'PENDING' };
        await processLink(testDb, link, { id: scanId }, config);

        // Check it remains as verified SUCCESS and is not deleted.
        const result = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.url, workingUrl)
        ));

        expect(result.length).toBe(1);
        expect(result[0].status).toBe('SUCCESS');
        expect(result[0].error).toContain('External link (Verified)');
    });

    it('should skip subdomain links without fetching when excludeSubdomains is true', async () => {
        const config = {
            startUrl: baseUrl,
            saveSkippedLinks: true,
            excludeSubdomains: true,
            skipExternal: true,
        };
        const scanId = await setupScan(config);
        const subdomainUrl = `http://api.localhost:${port}/forms/v1/processing-requests`;

        const pageLink = {
            id: crypto.randomUUID(),
            url: `${baseUrl}/subdomain-trigger`,
            scanId,
            depth: 0,
            status: 'PENDING',
        };
        await testDb.insert(links).values(pageLink);
        const newLinks = await processLink(testDb, pageLink, { id: scanId }, config);

        const skipped = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.url, subdomainUrl),
        )).then(res => res[0]);

        expect(skipped).toBeDefined();
        expect(skipped?.status).toBe('SKIPPED');
        expect(skipped?.error).toContain('Subdomain excluded');
        expect(newLinks?.find(l => l.url === subdomainUrl)).toBeUndefined();

        const formVariant = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.status, 'SKIPPED'),
        ));
        expect(formVariant.some(l =>
            l.url.includes('api.localhost') &&
            l.url.includes('roche-dropdown-location-region'),
        )).toBe(true);
    });

    it('should mark already-queued subdomain links as SKIPPED without fetching', async () => {
        const config = {
            startUrl: baseUrl,
            excludeSubdomains: true,
        };
        const scanId = await setupScan(config);
        // Intentionally unresolvable host — must not attempt a network fetch.
        const subdomainUrl = 'http://api-prod.localhost/never-fetch';

        await testDb.insert(links).values({
            id: crypto.randomUUID(),
            scanId,
            url: subdomainUrl,
            status: 'PENDING',
            depth: 1,
        });

        await processLink(
            testDb,
            { url: subdomainUrl, scanId, depth: 1, status: 'PENDING' },
            { id: scanId },
            config,
        );

        const result = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.url, subdomainUrl),
        )).then(res => res[0]);

        expect(result?.status).toBe('SKIPPED');
        expect(result?.error).toBe('Subdomain excluded');
        expect(result?.statusCode).toBeNull();
    });

    it('should match regexRules and wildcardExclusions case-insensitively', async () => {
        const config = {
            startUrl: baseUrl,
            saveSkippedLinks: true,
            regexRules: ['.*index%2ephp.*'],
            wildcardExclusions: ['*ACC-ES*']
        };
        const scanId = await setupScan(config);

        // Fetch /exclusion-trigger, which contains links that match the rules
        const link = { id: crypto.randomUUID(), url: `${baseUrl}/exclusion-trigger`, scanId, depth: 0, status: 'PENDING' };
        await testDb.insert(links).values(link);

        await processLink(testDb, link, { id: scanId }, config);

        // Verify the uppercase %2E index link was discovered and skipped
        const skippedLinkE = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.url, `${baseUrl}/some/path/index%2Ephp/some-page`)
        )).then(res => res[0]);
        
        expect(skippedLinkE).toBeDefined();
        expect(skippedLinkE.status).toBe('SKIPPED');
        expect(skippedLinkE.error).toContain('Regex Rule: .*index%2ephp.*');

        // Verify the lowercase acc-es wildcard link was discovered and skipped
        const skippedWildcard = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.url, `${baseUrl}/acc-es/careers`)
        )).then(res => res[0]);

        expect(skippedWildcard).toBeDefined();
        expect(skippedWildcard.status).toBe('SKIPPED');
        expect(skippedWildcard.error).toContain('Wildcard Rule: *ACC-ES*');
    });
});
