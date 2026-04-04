import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { server, port } from '../../scripts/serve-mock-site';
import { processLink } from '../../lib/crawler/worker';
import { getDb } from '../../lib/db';
import { scans, links } from '../../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

describe('Advanced Crawler Features (Phase 2)', () => {
    const baseUrl = `http://localhost:${port}`;
    const testDb = getDb();

    // Helper to setup a test scan
    async function setupScan(config: any) {
        const scanId = crypto.randomUUID();
        await testDb.insert(scans).values({
            id: scanId,
            userId: 'test-user',
            name: 'Advanced Test Scan',
            status: 'RUNNING',
            config: JSON.stringify(config),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return scanId;
    }

    it('should respect CSS selector exclusions (excluding header)', async () => {
        const config = {
            startUrl: baseUrl,
            skipSelectors: ['#main-header']
        };
        const scanId = await setupScan(config);
        
        // Starting with index.html
        const link = { url: baseUrl, scanId, depth: 0 };
        
        // Wait, the processLink will extract and insert new links
        await processLink(testDb, link, { id: scanId }, config);
        
        // Check if links from the header were extracted
        // The header has a link to "Global Home" (/) and country sites.
        // If #main-header is skipped, those shouldn't be extracted from the header.
        // Wait, index.html might have links ELSEWHERE too.
        
        // In our generate-mock-site.ts, index.html has:
        // generateHeader() (contains regional links)
        // main content: <p>Welcome to the global portal.</p> (no links)
        
        const extracted = await testDb.select().from(links).where(eq(links.scanId, scanId));
        
        // Regional links should NOT be there because they only exist in the header
        const regionalLink = extracted.find(l => l.url.includes('/it-it'));
        expect(regionalLink).toBeUndefined();
    });

    it('should respect "Stay in Subpath" logic', async () => {
        const itUrl = `${baseUrl}/it-it/`;
        const config = {
            startUrl: itUrl,
            doNotTraverseBackward: true
        };
        const scanId = await setupScan(config);
        
        // The /it-it/index.html has a link to /errors/404 (which is outside /it-it/)
        const link = { url: itUrl, scanId, depth: 0 };
        await processLink(testDb, link, { id: scanId }, config);
        
        const extracted = await testDb.select().from(links).where(eq(links.scanId, scanId));
        
        // The link to /errors/404 should be marked as SKIPPED with reason 'Traverse Backward'
        const errorLink = extracted.find(l => l.url.includes('/errors/404'));
        expect(errorLink).toBeDefined();
        expect(errorLink?.status).toBe('SKIPPED');
        expect(errorLink?.snippet).toContain('Traverse Backward');
    });

    it('should accurately map multiple parents for a single broken link', async () => {
        const config = {
            startUrl: baseUrl,
            maxDepth: 2,
            isTargeted: true,
            targetUrls: [baseUrl] // Dummy target to trigger isTargeted logic
        };

        const scanId = await setupScan(config);
        
        // 1. Process /it-it/ (has link to /errors/404)
        await processLink(testDb, { url: `${baseUrl}/it-it/`, scanId, depth: 1 }, { id: scanId }, config);
        
        // 2. Process /de-de/ (has link to /errors/404)
        await processLink(testDb, { url: `${baseUrl}/de-de/`, scanId, depth: 1 }, { id: scanId }, config);
        
        // Wait, processLink inserts PENDING links. 
        // We need to check if both parents (/it-it/ and /de-de/) are recorded.
        // In targeted mode, we insert a new record for each (url, parent) pair.
        
        const occurrences = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.url, `${baseUrl}/errors/404`)
        ));
        
        expect(occurrences.length).toBe(2);
        const parents = occurrences.map(o => o.parentUrl);
        expect(parents).toContain(`${baseUrl}/it-it/`);
        expect(parents).toContain(`${baseUrl}/de-de/`);
    });
});
