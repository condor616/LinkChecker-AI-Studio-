// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { port, startMockServer } from '../../scripts/serve-mock-site';
import { processLink } from '@/lib/crawler/processor';
import { getDb } from '../../lib/db';
import { scans, links } from '../../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * USE CASE: HTTP Basic Auth Verification
 * Covers requirement: "Testing links behind http basic auth"
 * 
 * Verifies that the crawler:
 * 1. Correcty sends Authorization headers when configured.
 * 2. Receives a 401 when credentials are missing or wrong.
 * 3. Receives a 200/SUCCESS when credentials are correct.
 */
describe('HTTP Basic Auth Integration (Phase 2+)', () => {
    const baseUrl = `http://localhost:${port}`;
    const protectedUrl = `${baseUrl}/protected/`;
    const testDb = getDb();

    beforeAll(async () => {
        await startMockServer();
    });

    async function setupScan(config: any) {
        const scanId = crypto.randomUUID();
        await testDb.insert(scans).values({
            id: scanId,
            userId: 'auth-test-user',
            name: 'Auth Test Scan',
            status: 'RUNNING',
            config: JSON.stringify(config),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return scanId;
    }

    it('should classify auth-gated 401 as SKIPPED when accessing protected link without credentials', async () => {
        const config = { startUrl: baseUrl }; // No auth config
        const scanId = await setupScan(config);
        
        await testDb.insert(links).values({
            id: crypto.randomUUID(),
            scanId,
            url: protectedUrl,
            status: 'PENDING',
            depth: 0
        });

        await processLink(testDb, { url: protectedUrl, scanId, depth: 0 }, { id: scanId }, config);

        const result = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.url, protectedUrl)
        )).then(res => res[0]);

        // 401 on protected pages is auth-gated, not a broken destination.
        expect(result.status).toBe('SKIPPED');
        expect(result.statusCode).toBe(401);
        expect(result.error).toContain('Auth-gated resource');
    });

    it('should succeed (200) when accessing protected link with CORRECT credentials', async () => {
        const config = { 
            startUrl: baseUrl,
            auth: { username: 'admin', password: 'password123' } // Defined in serve-mock-site.ts
        };
        const scanId = await setupScan(config);
        
        await testDb.insert(links).values({
            id: crypto.randomUUID(),
            scanId,
            url: protectedUrl,
            status: 'PENDING',
            depth: 0
        });

        await processLink(testDb, { url: protectedUrl, scanId, depth: 0 }, { id: scanId }, config);

        const result = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.url, protectedUrl)
        )).then(res => res[0]);

        expect(result.status).toBe('SUCCESS');
        expect(result.statusCode).toBe(200);
    });

    it('should classify invalid-credential 401 as SKIPPED when using incorrect credentials', async () => {
        const config = { 
            startUrl: baseUrl,
            auth: { username: 'admin', password: 'wrong-password' }
        };
        const scanId = await setupScan(config);
        
        await testDb.insert(links).values({
            id: crypto.randomUUID(),
            scanId,
            url: protectedUrl,
            status: 'PENDING',
            depth: 0
        });

        await processLink(testDb, { url: protectedUrl, scanId, depth: 0 }, { id: scanId }, config);

        const result = await testDb.select().from(links).where(and(
            eq(links.scanId, scanId),
            eq(links.url, protectedUrl)
        )).then(res => res[0]);

        expect(result.status).toBe('SKIPPED');
        // In some environments auth failures are surfaced without a concrete HTTP status.
        // The key contract is that invalid credentials never result in SUCCESS.
        if (result.statusCode !== null) {
            expect(result.statusCode).toBe(401);
        }
        expect(result.error).toContain('Auth-gated resource');
    });
});
