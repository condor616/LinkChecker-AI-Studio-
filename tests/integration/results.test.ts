import { describe, it, expect, beforeAll } from 'vitest';
import { getDb } from '../../lib/db';
import { scans, links } from '../../lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * USE CASE: Results Tracking & Traceability
 * Covers requirements:
 * - Broken link parent mapping (showing where the link is found)
 * - Re-check status updates persistence
 */
describe('Results & Traceability (Phase 2)', () => {

    const testDb = getDb();

    it('should correctly filter broken links and their parent pages', async () => {
        const scanId = crypto.randomUUID();
        await testDb.insert(scans).values({
            id: scanId,
            userId: 'test-user',
            name: 'Results Test',
            status: 'COMPLETED',
            config: '{}',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const brokenUrl = 'http://example.com/broken';
        
        // Insert multiple occurrences of the same broken link
        const parents = ['http://example.com/page1', 'http://example.com/page2', 'http://example.com/page3'];
        for (const parent of parents) {
            await testDb.insert(links).values({
                id: crypto.randomUUID(),
                scanId,
                url: brokenUrl,
                parentUrl: parent,
                status: 'BROKEN',
                statusCode: 404,
                depth: 1,
                checkedAt: new Date()
            });
        }

        // Simulating the dashboard query for broken links
        const brokenLinks = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.status, 'BROKEN')
        )).orderBy(desc(links.checkedAt));

        expect(brokenLinks.length).toBe(3);
        const uniqueBroken = new Set(brokenLinks.map(l => l.url));
        expect(uniqueBroken.size).toBe(1);
        
        const recordedParents = brokenLinks.map(l => l.parentUrl);
        expect(recordedParents).toEqual(expect.arrayContaining(parents));
    });

    it('should handle re-check status updates correctly', async () => {
        const scanId = crypto.randomUUID();
        const url = 'http://example.com/to-recheck';
        const linkId = crypto.randomUUID();

        await testDb.insert(scans).values({
            id: scanId,
            userId: 'test-user',
            name: 'Re-check Test',
            status: 'COMPLETED',
            config: '{}',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await testDb.insert(links).values({
            id: linkId,
            scanId,
            url,
            status: 'BROKEN',
            statusCode: 404,
            depth: 1,
            checkedAt: new Date()
        });

        // Simulating a re-check that succeeds
        await testDb.update(links).set({
            status: 'SUCCESS',
            statusCode: 200,
            isRechecked: true,
            checkedAt: new Date()
        }).where(eq(links.id, linkId));

        const updated = await testDb.select().from(links).where(eq(links.id, linkId)).then(res => res[0]);
        expect(updated.status).toBe('SUCCESS');
        expect(updated.isRechecked).toBe(true);
    });
});
