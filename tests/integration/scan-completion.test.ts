/** @vitest-environment node */
import { describe, it, expect, beforeEach } from 'vitest';
import { maybeCompleteScan, type ScanCompletionQueue } from '@/lib/crawler/scan-completion';
import { getDb } from '@/lib/db';
import { scans, links } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

describe('Scan completion', () => {
    const db = () => getDb();
    const idleQueue = (): ScanCompletionQueue => ({
        getBlockingJobs: async () => [],
        getWaitingCount: async () => 0,
    });

    async function setupScan(status: string, config: Record<string, unknown> = {}) {
        const scanId = crypto.randomUUID();
        await db().insert(scans).values({
            id: scanId,
            userId: 'completion-test-user',
            name: 'Completion Test',
            status,
            config: JSON.stringify({ startUrl: 'https://example.com', ...config }),
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        return scanId;
    }

    async function addLink(scanId: string, values: Partial<typeof links.$inferInsert> & { url: string; status: string }) {
        await db().insert(links).values({
            id: crypto.randomUUID(),
            scanId,
            depth: 0,
            ...values,
        });
    }

    beforeEach(async () => {
        await db().delete(links);
        await db().delete(scans);
    });

    it('marks COMPLETED after the last job when no PENDING work remains', async () => {
        const scanId = await setupScan('RUNNING');
        await addLink(scanId, { url: 'https://example.com', status: 'SUCCESS', statusCode: 200, type: 'text/html' });
        await addLink(scanId, { url: 'https://example.com/about', status: 'BROKEN', statusCode: 404 });

        const completed = await maybeCompleteScan(db(), scanId, { currentJobId: 'job-last', queue: idleQueue() });

        expect(completed).toBe(true);
        const scan = await db().select().from(scans).where(eq(scans.id, scanId)).then((rows) => rows[0]);
        expect(scan.status).toBe('COMPLETED');
    });

    it('completes a targeted scan whose non-targets were skipped', async () => {
        const target = 'https://example.com/report.pdf';
        const scanId = await setupScan('RUNNING', {
            isTargeted: true,
            targetUrls: [target],
            skipExternal: true,
            saveSkippedLinks: true,
        });
        await addLink(scanId, { url: 'https://example.com', status: 'SUCCESS', statusCode: 200, type: 'text/html' });
        await addLink(scanId, { url: target, status: 'SUCCESS', statusCode: 200, type: 'application/pdf' });
        await addLink(scanId, {
            url: 'https://other.example/nav',
            status: 'SKIPPED',
            error: 'External link',
            parentUrl: 'https://example.com',
        });
        await addLink(scanId, {
            url: 'https://example.com/hidden',
            status: 'SKIPPED',
            error: 'Not a target',
            parentUrl: 'https://example.com',
        });

        const completed = await maybeCompleteScan(db(), scanId, { queue: idleQueue() });

        expect(completed).toBe(true);
        const scan = await db().select().from(scans).where(eq(scans.id, scanId)).then((rows) => rows[0]);
        expect(scan.status).toBe('COMPLETED');
    });

    it('does not complete while PENDING links remain', async () => {
        const scanId = await setupScan('RUNNING');
        await addLink(scanId, { url: 'https://example.com', status: 'SUCCESS', statusCode: 200 });
        await addLink(scanId, { url: 'https://example.com/next', status: 'PENDING' });

        const completed = await maybeCompleteScan(db(), scanId, { queue: idleQueue() });

        expect(completed).toBe(false);
        const scan = await db().select().from(scans).where(eq(scans.id, scanId)).then((rows) => rows[0]);
        expect(scan.status).toBe('RUNNING');
    });

    it('completes when only PROCESSING leftovers remain and the queue is idle', async () => {
        const scanId = await setupScan('RUNNING', { isTargeted: true, targetUrls: ['https://example.com/file.pdf'] });
        await addLink(scanId, {
            url: 'https://example.com/news?page=31',
            status: 'PROCESSING',
            statusCode: 200,
            type: 'text/html',
            checkedAt: new Date(),
        });

        const completed = await maybeCompleteScan(db(), scanId, { queue: idleQueue() });

        expect(completed).toBe(true);
        const scan = await db().select().from(scans).where(eq(scans.id, scanId)).then((rows) => rows[0]);
        expect(scan.status).toBe('COMPLETED');
        const leftover = await db().select().from(links).where(eq(links.scanId, scanId)).then((rows) => rows[0]);
        expect(leftover.status).toBe('SUCCESS');
    });

    it('does not complete while another job for this scan is still active', async () => {
        const scanId = await setupScan('RUNNING');
        await addLink(scanId, { url: 'https://example.com', status: 'PROCESSING', statusCode: 200, type: 'text/html' });

        const completed = await maybeCompleteScan(db(), scanId, {
            currentJobId: 'job-a',
            queue: {
                getBlockingJobs: async () => [{ id: 'job-b', data: { scanId } }],
            },
        });

        expect(completed).toBe(false);
        const scan = await db().select().from(scans).where(eq(scans.id, scanId)).then((rows) => rows[0]);
        expect(scan.status).toBe('RUNNING');
    });

    it('does not complete while BullMQ active slots are missing or malformed', async () => {
        const scanId = await setupScan('RUNNING');
        await addLink(scanId, { url: 'https://example.com', status: 'SUCCESS', statusCode: 200, type: 'text/html' });

        const completed = await maybeCompleteScan(db(), scanId, {
            currentJobId: 'job-a',
            queue: {
                getBlockingJobs: async () => [undefined as any, { id: 'job-a' } as any],
            },
        });

        expect(completed).toBe(false);
        const scan = await db().select().from(scans).where(eq(scans.id, scanId)).then((rows) => rows[0]);
        expect(scan.status).toBe('RUNNING');
    });

    it('requeues orphaned PENDING links when the queue is idle', async () => {
        const scanId = await setupScan('RUNNING');
        await addLink(scanId, { url: 'https://example.com/next', status: 'PENDING' });
        const requeued: string[] = [];

        const completed = await maybeCompleteScan(db(), scanId, {
            requeueOrphans: true,
            queue: {
                getBlockingJobs: async () => [],
                getWaitingCount: async () => 0,
                requeuePendingLinks: async (pending) => {
                    requeued.push(...pending.map((l) => l.url));
                },
            },
        });

        expect(completed).toBe(false);
        expect(requeued).toEqual(['https://example.com/next']);
        const scan = await db().select().from(scans).where(eq(scans.id, scanId)).then((rows) => rows[0]);
        expect(scan.status).toBe('RUNNING');
    });

    it('does not requeue orphans while the global waiting list is still busy', async () => {
        const scanId = await setupScan('RUNNING');
        await addLink(scanId, { url: 'https://example.com/next', status: 'PENDING' });
        const requeued: string[] = [];

        await maybeCompleteScan(db(), scanId, {
            requeueOrphans: true,
            queue: {
                getBlockingJobs: async () => [],
                getWaitingCount: async () => 12,
                requeuePendingLinks: async (pending) => {
                    requeued.push(...pending.map((l) => l.url));
                },
            },
        });

        expect(requeued).toEqual([]);
    });

    it('requeues orphans during a sweep even if another scan still has waiting jobs', async () => {
        const scanId = await setupScan('RUNNING');
        await addLink(scanId, { url: 'https://example.com/next', status: 'PENDING' });
        const requeued: string[] = [];

        const completed = await maybeCompleteScan(db(), scanId, {
            requeueOrphans: true,
            forceRequeue: true,
            queue: {
                getBlockingJobs: async () => [],
                getWaitingCount: async () => 12,
                requeuePendingLinks: async (pending) => {
                    requeued.push(...pending.map((l) => l.url));
                },
            },
        });

        expect(completed).toBe(false);
        expect(requeued).toEqual(['https://example.com/next']);
    });

    it('does not override PAUSED scans', async () => {
        const scanId = await setupScan('PAUSED');
        await addLink(scanId, { url: 'https://example.com', status: 'SUCCESS', statusCode: 200 });

        const completed = await maybeCompleteScan(db(), scanId, { queue: idleQueue() });

        expect(completed).toBe(false);
        const scan = await db().select().from(scans).where(eq(scans.id, scanId)).then((rows) => rows[0]);
        expect(scan.status).toBe('PAUSED');
    });
});
