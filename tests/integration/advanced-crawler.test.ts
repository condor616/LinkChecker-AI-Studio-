import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { port, startMockServer } from '../../scripts/serve-mock-site';
import { processLink } from '@/lib/crawler/processor';
import { getDb } from '../../lib/db';
import { scans, links } from '../../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * USE CASE: Advanced Crawler Features Verification
 * Covers requirements: 
 * - CSS Selector Exclusions (e.g. skipping header)
 * - "Stay in Subpath" logic (Do Not Traverse Backward)
 * - Multi-parent mapping for broken links
 * 
 * Uses the live `tests/mock-site` with multi-country subpaths.
 */
describe('Advanced Crawler Features (Phase 2)', () => {
    const baseUrl = `http://localhost:${port}`;
    const testDb = getDb();

    beforeAll(async () => {
        startMockServer();
    });

    // Helper to setup a test scan
    async function setupScan(config: any) {
        const scanId = crypto.randomUUID();
        const userId = `adv-user-${crypto.randomUUID().slice(0, 8)}`;
        await testDb.insert(scans).values({
            id: scanId,
            userId: userId,
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
        
        await processLink(testDb, link, { id: scanId }, config);
        
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
        
        const link = { url: itUrl, scanId, depth: 0 };
        await processLink(testDb, link, { id: scanId }, config);
        
        const extracted = await testDb.select().from(links).where(eq(links.scanId, scanId));
        
        // Parent link should be PENDING (discovered but not yet fetched in this isolated test)
        // Note: The crawler strips trailing slashes, so http://localhost:PORT/ becomes http://localhost:PORT
        const backwardLink = extracted.find(l => l.url === baseUrl || l.url.endsWith('index.html'));
        expect(backwardLink).toBeDefined();
        // Since we didn't fetch it, it stays PENDING in the DB
        expect(backwardLink?.status).toBe('PENDING'); 
        
        // Ensure no children were extracted FROM index.html (which has many links)
        const itPageLinks = extracted.filter(l => l.parentUrl === itUrl);
        // itPageLinks should include index.html but not things WITHIN index.html
        expect(itPageLinks.length).toBeGreaterThan(0);
        
        const grandchildLinks = extracted.filter(l => l.parentUrl === backwardLink?.url);
        expect(grandchildLinks.length).toBe(0);
    });

    it('should accurately map multiple parents for a single broken link', async () => {
        const config = {
            startUrl: baseUrl,
            maxDepth: 2,
            isTargeted: true,
            targetUrls: [baseUrl, `${baseUrl}/errors/404`] // Include the broken link as a target to verify multi-parent mapping
        };

        const scanId = await setupScan(config);
        
        // 1. Process /it-it/ (has link to /errors/404)
        await processLink(testDb, { url: `${baseUrl}/it-it/`, scanId, depth: 1 }, { id: scanId }, config);
        
        // 2. Process /de-de/ (has link to /errors/404)
        await processLink(testDb, { url: `${baseUrl}/de-de/`, scanId, depth: 1 }, { id: scanId }, config);
        
        const occurrences = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.url, `${baseUrl}/errors/404`)
        ));
        
        expect(occurrences.length).toBe(2);
        const parents = occurrences.map(o => o.parentUrl);
        expect(parents).toContain(`${baseUrl}/it-it/`);
        expect(parents).toContain(`${baseUrl}/de-de/`);
    });

    it('should check external link status but not traverse into it when skipExternal is true', async () => {
        const config = { startUrl: baseUrl, skipExternal: true };
        const scanId = await setupScan(config);
        
        const externalUrl = 'https://google.com';
        await testDb.insert(links).values({
            id: crypto.randomUUID(),
            scanId: scanId,
            url: externalUrl,
            status: 'PENDING',
            depth: 1
        });
        await processLink(testDb, { url: externalUrl, scanId, depth: 1 }, { id: scanId }, config);
        
        const result = await testDb.select().from(links).where(and(eq(links.scanId, scanId), eq(links.url, externalUrl))).then(res => res[0]);
        expect(result).toBeDefined();
        expect(result?.status).not.toBe('SKIPPED'); // Should be checked
        
        // Should NOT have extracted links
        const children = await testDb.select().from(links).where(eq(links.parentUrl, externalUrl));
        expect(children.length).toBe(0);
    });

    it('should traverse into external links if skipExternal is false', async () => {
        // We use 127.0.0.1 as a "different host" than localhost to trigger external logic
        const externalUrl = `http://127.0.0.1:${port}/`; 
        const config = { startUrl: baseUrl, skipExternal: false }; // DISABLE skip
        const scanId = await setupScan(config);
        
        await testDb.insert(links).values({
            id: crypto.randomUUID(),
            scanId: scanId,
            url: externalUrl,
            status: 'PENDING',
            depth: 1
        });

        // We need to make sure the crawler treats this as external.
        // isInternal calculation: currentHost === startHost
        // startHost: localhost, currentHost: external-site.com
        
        await processLink(testDb, { url: externalUrl, scanId, depth: 1 }, { id: scanId }, config);
        
        const result = await testDb.select().from(links).where(and(eq(links.scanId, scanId), eq(links.url, externalUrl))).then(res => res[0]);
        expect(result?.status).toBe('SUCCESS');
        
        // This should have extracted links because skipExternal is false!
        const children = await testDb.select().from(links).where(eq(links.parentUrl, externalUrl));
        expect(children.length).toBeGreaterThan(0);
    });

    it('should check backward link status but not traverse into it when doNotTraverseBackward is true', async () => {
        const startUrl = `${baseUrl}/it-it/`;
        const backwardUrl = `${baseUrl}/index.html`;
        const config = { startUrl, doNotTraverseBackward: true };
        const scanId = await setupScan(config);
        
        await testDb.insert(links).values({
            id: crypto.randomUUID(),
            scanId: scanId,
            url: backwardUrl,
            status: 'PENDING',
            depth: 1
        });

        await processLink(testDb, { url: backwardUrl, scanId, depth: 1 }, { id: scanId }, config);
        
        const result = await testDb.select().from(links).where(and(eq(links.scanId, scanId), eq(links.url, backwardUrl))).then(res => res[0]);
        expect(result).toBeDefined();
        expect(result?.status).toBe('SUCCESS');
        
        const childLinks = await testDb.select().from(links).where(and(eq(links.scanId, scanId), eq(links.parentUrl, backwardUrl)));
        expect(childLinks.length).toBe(0);
    });

    it('should check status of regex-excluded links but not traverse them', async () => {
        const startUrl = baseUrl;
        const excludedPath = `${baseUrl}/it-it/`;
        const config = { 
            startUrl, 
            regexRules: ['/it-it/'] // This should exclude the folder from traversal
        };
        const scanId = await setupScan(config);
        
        // Link to /it-it/ is found on index page. We manually insert it as PENDING to simulate discovery.
        await testDb.insert(links).values({
            id: crypto.randomUUID(),
            scanId: scanId,
            url: excludedPath,
            status: 'PENDING',
            depth: 1
        });
        
        await processLink(testDb, { url: excludedPath, scanId, depth: 1 }, { id: scanId }, config);
        
        const result = await testDb.select().from(links).where(and(eq(links.scanId, scanId), eq(links.url, excludedPath))).then(res => res[0]);
        expect(result).toBeDefined();
        expect(result?.status).toBe('SUCCESS'); // It WAS checked!
        
        // But NO links should have been extracted from it
        const childLinks = await testDb.select().from(links).where(and(eq(links.scanId, scanId), eq(links.parentUrl, excludedPath)));
        expect(childLinks.length).toBe(0);
    });

    it('should check status of wildcard-excluded links but not traverse them', async () => {
        const startUrl = baseUrl;
        const excludedPath = `${baseUrl}/de-de/`;
        const config = { 
            startUrl, 
            wildcardExclusions: ['*de-de*'] // Simplified wildcard
        };
        const scanId = await setupScan(config);
        
        await testDb.insert(links).values({
            id: crypto.randomUUID(),
            scanId: scanId,
            url: excludedPath,
            status: 'PENDING',
            depth: 1
        });

        await processLink(testDb, { url: excludedPath, scanId, depth: 1 }, { id: scanId }, config);
        
        const result = await testDb.select().from(links).where(and(eq(links.scanId, scanId), eq(links.url, excludedPath))).then(res => res[0]);
        expect(result).toBeDefined();
        expect(result?.status).toBe('SUCCESS');
        
        // It should NOT have extracted links from it because of the wildcard
        const childLinks = await testDb.select().from(links).where(and(eq(links.scanId, scanId), eq(links.parentUrl, excludedPath)));
        expect(childLinks.length).toBe(0);
    });
});
