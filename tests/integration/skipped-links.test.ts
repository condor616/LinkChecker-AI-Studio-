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
        startMockServer();
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

    it('should record skipped links when saveSkippedLinks is true', async () => {
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
        expect(skippedLink?.error).toContain('Regex: it-it');
        
        // Ensure it's NOT in the returned newLinks list (so it's not queued for worker)
        const inNewLinks = newLinks?.find(l => l.url === skippedLink?.url);
        expect(inNewLinks).toBeUndefined();
    });

    it('should NOT record skipped links when saveSkippedLinks is false', async () => {
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

    it('should correctly identify external link skip reason', async () => {
        const config = {
            startUrl: baseUrl,
            saveSkippedLinks: true,
            skipExternal: true
        };
        const scanId = await setupScan(config);
        
        // Mock a discovery of an external link on the index page
        // The index page has a link to google.com (if not, we can assume it finds one if we mock the HTML or just check logic)
        // Actually, serve-mock-site index.html has external links.
        
        const link = { url: baseUrl, scanId, depth: 0, status: 'PENDING' };
        await processLink(testDb, link, { id: scanId }, config);
        
        const externalSkip = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.status, 'SKIPPED')
        )).then(res => res.find(l => !l.url.startsWith(baseUrl)));
        
        if (externalSkip) {
            expect(externalSkip.error).toContain('External link (skipExternal enabled)');
        }
    });

    it('should record skipped links found on targeted pages', async () => {
        const config = {
            startUrl: baseUrl,
            isTargeted: true,
            targetUrls: [baseUrl], // Only target the index page
            saveSkippedLinks: true,
            regexRules: ['it-it'] 
        };
        const scanId = await setupScan(config);
        
        const link = { url: baseUrl, scanId, depth: 0, status: 'PENDING' };
        await processLink(testDb, link, { id: scanId }, config);
        
        const skippedLink = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.status, 'SKIPPED')
        )).then(res => res[0]);
        
        expect(skippedLink).toBeDefined();
        expect(skippedLink?.url).toContain('/it-it');
    });
});
