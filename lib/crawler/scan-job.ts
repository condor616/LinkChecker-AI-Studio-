import { Job } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import { ScanJobData, scanQueue } from '../bullmq';
import { processLink } from './processor';
import { getDb } from '../db';
import { scans, links } from '../db/schema';
import { maybeCompleteScan } from './scan-completion';
import { createScanCompletionQueue, toBulkJobs } from './scan-queue';

export { createScanCompletionQueue, scanLinkJobId } from './scan-queue';

export async function processScanJob(job: Job<ScanJobData>): Promise<void> {
  if (!job?.data) {
    console.warn(`Job ${job?.id} is missing payload data. Skipping.`);
    return;
  }

  const { userId, scanId, url, config, linkId } = job.data;
  const userDb = getDb(userId);
  const queue = createScanCompletionQueue(userId);
  const completionOpts = {
    currentJobId: job.id != null ? String(job.id) : undefined,
    queue,
    requeueOrphans: true,
  };

  try {
    const linkResult = linkId
      ? await userDb.select().from(links).where(eq(links.id, linkId)).limit(1)
      : await userDb.select().from(links).where(and(eq(links.scanId, scanId), eq(links.url, url))).limit(1);

    const link = linkResult[0];
    if (!link) {
      console.warn(`Link not found for URL ${url} in scan ${scanId}`);
      return;
    }

    const scanResult = await userDb.select().from(scans).where(eq(scans.id, scanId)).limit(1);
    const scan = scanResult[0];
    if (!scan || scan.status !== 'RUNNING') {
      return;
    }

    if (link.status === 'SUCCESS' || link.status === 'BROKEN' || link.status === 'SKIPPED') {
      return;
    }

    if (link.status === 'PENDING') {
      await userDb.update(links)
        .set({ status: 'PROCESSING' })
        .where(and(eq(links.id, link.id), eq(links.status, 'PENDING')));

      const claimed = await userDb.select({ status: links.status }).from(links).where(eq(links.id, link.id)).limit(1);
      if (claimed[0]?.status !== 'PROCESSING') {
        return;
      }
    } else if (link.status !== 'PROCESSING') {
      return;
    }

    const newLinks = await processLink(userDb, { ...link, status: 'PROCESSING' }, scan, config);

    if (newLinks && newLinks.length > 0) {
      const stillRunning = await userDb.select({ status: scans.status }).from(scans).where(eq(scans.id, scanId)).limit(1);
      if (stillRunning[0]?.status !== 'RUNNING') {
        return;
      }
      await scanQueue.addBulk(toBulkJobs(userId, scanId, config, newLinks));
    }
  } finally {
    try {
      await maybeCompleteScan(userDb, scanId, completionOpts);
    } catch (err: any) {
      console.error(`Completion check failed for scan ${scanId}:`, err?.message || err);
    }
  }
}
