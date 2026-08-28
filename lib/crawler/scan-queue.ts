import { scanQueue } from '../bullmq';
import { isTargetUrlMatch } from '../utils/url';
import type { ScanCompletionQueue } from './scan-completion';

export function scanLinkJobId(linkId: string): string {
  return `scan-link-${linkId}`;
}

export function parseScanConfig(config: unknown): any {
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  }
  return config && typeof config === 'object' ? config : {};
}

export function toBulkJobs(userId: string, scanId: string, config: any, newLinks: any[]) {
  const targetUrls = config.targetUrls || [];
  const isTargeted = !!config.isTargeted && targetUrls.length > 0;

  return newLinks.map((l) => {
    const isTarget = isTargeted && targetUrls.some((target: string) => isTargetUrlMatch(l.url, target));
    return {
      name: scanLinkJobId(l.id),
      data: {
        userId,
        scanId,
        url: l.url,
        depth: l.depth,
        config,
        linkId: l.id,
      },
      opts: {
        jobId: scanLinkJobId(l.id),
        priority: isTarget ? 1 : 10,
      },
    };
  });
}

const QUEUED_JOB_STATES = new Set(['waiting', 'active', 'delayed', 'paused', 'waiting-children']);

export async function pendingLinksMissingFromQueue(
  pending: Array<{ id: string; url: string; depth: number | null }>,
) {
  const missing: Array<{ id: string; url: string; depth: number | null }> = [];
  for (const link of pending) {
    const jobId = scanLinkJobId(link.id);
    const existing = await scanQueue.getJob(jobId);
    if (!existing) {
      missing.push(link);
      continue;
    }
    const state = await existing.getState();
    if (QUEUED_JOB_STATES.has(state)) continue;
    try {
      await existing.remove();
    } catch (err: any) {
      console.warn(`Could not remove ${state} job ${jobId} before requeue:`, err?.message || err);
      continue;
    }
    missing.push(link);
  }
  return missing;
}

export function createScanCompletionQueue(userId: string): ScanCompletionQueue {
  return {
    getBlockingJobs: () => scanQueue.getJobs(['active', 'delayed']),
    getWaitingCount: async () => {
      const counts = await scanQueue.getJobCounts('waiting');
      return counts.waiting ?? 0;
    },
    requeuePendingLinks: async (pending, scan) => {
      const toAdd = await pendingLinksMissingFromQueue(pending);
      if (toAdd.length === 0) return;
      const scanConfig = parseScanConfig(scan.config);
      console.log(`Re-enqueueing ${toAdd.length} of ${pending.length} PENDING links for scan ${scan.id}.`);
      await scanQueue.addBulk(toBulkJobs(userId, scan.id, scanConfig, toAdd));
    },
  };
}
