// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { processLink } from '@/lib/crawler/processor';
import { getDb } from '@/lib/db';
import { scans, links, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

describe('Auth-gated External Link Classification', () => {
    const testDb = getDb();
    const userId = `auth-gated-user-${crypto.randomUUID().slice(0, 8)}`;
    let server: any;
    let baseUrl: string;

    beforeAll(async () => {
        const app = new Hono();

        app.get('/login-required', (c) =>
            c.html('<html><body><h1>Please log in to continue</h1></body></html>', 401, {
                'WWW-Authenticate': 'Bearer realm="example"',
            })
        );

        app.get('/missing', (c) => c.text('Not Found', 404));

        server = serve({ fetch: app.fetch, port: 0 });
        const address = await new Promise<any>((resolve) => {
            server.on('listening', () => resolve(server.address()));
        });

        baseUrl = `http://localhost:${address.port}`;

        await testDb.insert(users).values({
            id: userId,
            email: `${userId}@example.com`,
            passwordHash: 'hash',
            role: 'USER',
            createdAt: new Date(),
        });
    });

    afterAll(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await testDb.delete(users).where(eq(users.id, userId));
    });

    async function setupScan(config: any) {
        const scanId = crypto.randomUUID();
        await testDb.insert(scans).values({
            id: scanId,
            userId,
            name: 'Auth-gated Classification Scan',
            status: 'RUNNING',
            config: JSON.stringify(config),
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        return scanId;
    }

    it('marks 401 login-required page as SKIPPED, not BROKEN', async () => {
        const scanId = await setupScan({ startUrl: baseUrl });
        const linkUrl = `${baseUrl}/login-required`;

        await testDb.insert(links).values({
            id: crypto.randomUUID(),
            scanId,
            url: linkUrl,
            status: 'PENDING',
            depth: 0,
        });

        await processLink(testDb, { url: linkUrl, scanId, depth: 0 }, { id: scanId }, { startUrl: baseUrl });

        const result = await testDb
            .select()
            .from(links)
            .where(and(eq(links.scanId, scanId), eq(links.url, linkUrl)))
            .then((res) => res[0]);

        expect(result.status).toBe('SKIPPED');
        expect(result.statusCode).toBe(401);
        expect(result.error).toContain('Auth-gated resource');
    });

    it('keeps true missing pages as BROKEN', async () => {
        const scanId = await setupScan({ startUrl: baseUrl });
        const linkUrl = `${baseUrl}/missing`;

        await testDb.insert(links).values({
            id: crypto.randomUUID(),
            scanId,
            url: linkUrl,
            status: 'PENDING',
            depth: 0,
        });

        await processLink(testDb, { url: linkUrl, scanId, depth: 0 }, { id: scanId }, { startUrl: baseUrl });

        const result = await testDb
            .select()
            .from(links)
            .where(and(eq(links.scanId, scanId), eq(links.url, linkUrl)))
            .then((res) => res[0]);

        expect(result.status).toBe('BROKEN');
        expect(result.statusCode).toBe(404);
    });
});
