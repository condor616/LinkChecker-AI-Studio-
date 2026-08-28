import { Job } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import { ScanJobData, scanQueue } from '../bullmq';
import { processLink } from './processor';
import { getDb } from '../db';
import { scans, links } from '../db/schema';
import { isTargetUrlMatch } from '../utils/url';
import { maybeCompleteScan, type ScanCompletionQueue } from './scan-completion';

function parseScanConfig(config: unknown): any {
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  }
  return config && typeof config === 'object' ? config : {};
}

function toBulkJobs(userId: string, scanId: string, config: any, newLinks: any[]) {
  const targetUrls = config.targetUrls || [];
  const isTargeted = !!config.isTargeted && targetUrls.length > 0;

  return newLinks.map((l) => {
    const isTarget = isTargeted && targetUrls.some((target: string) => isTargetUrlMatch(l.url, target));
    return {
      name: `scan-link-${l.id}`,
      data: {
        userId,
        scanId,
        url: l.url,
        depth: l.depth,
        config,
        linkId: l.id,
      },
      opts: {
        jobId: `scan-link-${l.id}`,
        priority: isTarget ? 1 : 10,
      },
    };
  });
}

export function createScanCompletionQueue(userId: string): ScanCompletionQueue {
  return {
    getBlockingJobs: () => scanQueue.getJobs(['active', 'delayed']),
    getWaitingCount: async () => {
      const counts = await scanQueue.getJobCounts('waiting');
      return counts.waiting ?? 0;
    },
    requeuePendingLinks: async (pending, scan) => {
      const scanConfig = parseScanConfig(scan.config);
      await scanQueue.addBulk(toBulkJobs(userId, scan.id, scanConfig, pending));
    },
  };
}

export async function processScanJob(job: Job<ScanJobData>): Promise<void> {
  const { userId, scanId, url, depth, config, linkId } = job.data;
  const userDb = getDb(userId);
  const queue = createScanCompletionQueue(userId);
  const completionOpts = { currentJobId: job.id != null ? String(job.id) : undefined, queue };

  try {
    console.log(`Processing Job ${job.id}: ${url} (Depth: ${depth})`);

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
      console.log(`Scan ${scanId} is not running. Skipping job.`);
      return;
    }

    if (link.status === 'SUCCESS' || link.status === 'BROKEN' || link.status === 'SKIPPED') {
      console.log(`Link ${link.url} is already ${link.status}. Skipping job ${job.id}.`);
      return;
    }

    if (link.status === 'PENDING') {
      await userDb.update(links)
        .set({ status: 'PROCESSING' })
        .where(and(eq(links.id, link.id), eq(links.status, 'PENDING')));

      const claimed = await userDb.select({ status: links.status }).from(links).where(eq(links.id, link.id)).limit(1);
      if (claimed[0]?.status !== 'PROCESSING') {
        console.log(`Link ${link.url} was claimed by another job. Skipping job ${job.id}.`);
        return;
      }
    } else if (link.status !== 'PROCESSING') {
      console.log(`Link ${link.url} is already ${link.status}. Skipping job ${job.id}.`);
      return;
    }

    const newLinks = await processLink(userDb, { ...link, status: 'PROCESSING' }, scan, config);

    if (newLinks && newLinks.length > 0) {
      console.log(`Found ${newLinks.length} new links for scan ${scanId}. Enqueuing...`);
      await scanQueue.addBulk(toBulkJobs(userId, scanId, config, newLinks));
    }
  } finally {
    await maybeCompleteScan(userDb, scanId, completionOpts);
  }
}
