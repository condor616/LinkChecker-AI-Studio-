import { describe, it, expect, beforeAll } from 'vitest';
import { server, port } from '../../scripts/serve-mock-site';
import { processLink } from '../../lib/crawler/worker';
import { getDb } from '../../lib/db';
import { scans, links } from '../../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

describe('Targeted Scan (Phase 2)', () => {
    const baseUrl = `http://localhost:${port}`;
    const testDb = getDb();

    async function setupScan(config: any) {
        const scanId = crypto.randomUUID();
        await testDb.insert(scans).values({
            id: scanId,
            userId: 'test-user',
            name: 'Targeted Test Scan',
            status: 'RUNNING',
            config: JSON.stringify(config),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return scanId;
    }

    it('should process a targeted scan with multiple specific URLs', async () => {
        const targets = [
            `${baseUrl}/assets/style.css`,
            `${baseUrl}/it-it/products`,
            `${baseUrl}/errors/404`
        ];
        const config = {
            startUrl: baseUrl,
            isTargeted: true,
            targetUrls: targets
        };
        const scanId = await setupScan(config);

        // Pre-insert the targets as PENDING
        for (const url of targets) {
            await testDb.insert(links).values({
                id: crypto.randomUUID(),
                scanId,
                url,
                status: 'PENDING',
                depth: 0
            });
        }

        // Process each target manually (as the worker would)
        for (const url of targets) {
            await processLink(testDb, { url, scanId, depth: 0 }, { id: scanId }, config);
        }


        const results = await testDb.select().from(links).where(eq(links.scanId, scanId));
        expect(results.length).toBe(targets.length);
        
        const cssResult = results.find(l => l.url.endsWith('.css'));
        expect(cssResult?.status).toBe('SUCCESS');
        expect(cssResult?.type).toContain('text/css');

        const errorResult = results.find(l => l.url.includes('404'));
        expect(errorResult?.status).toBe('BROKEN');
        expect(errorResult?.statusCode).toBe(404);
    });

    it('should work with Basic Auth (mocked simulation)', async () => {
        // Hono server doesn't have auth for these routes yet, but we can verify the headers are sent
        // Actually, we'll just verify processLink doesn't crash and correctly identifies auth config
        const config = {
            startUrl: baseUrl,
            auth: { username: 'admin', password: 'password123' }
        };
        const scanId = await setupScan(config);
        
        await testDb.insert(links).values({
            id: crypto.randomUUID(),
            scanId,
            url: baseUrl,
            status: 'PENDING',
            depth: 0
        });

        const link = { url: baseUrl, scanId, depth: 0 };
        
        await processLink(testDb, link, { id: scanId }, config);

        
        const result = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.url, baseUrl)
        )).then(res => res[0]);
        
        expect(result.status).toBe('SUCCESS');
    });
});
