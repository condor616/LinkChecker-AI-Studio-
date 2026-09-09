import { eq, and, isNotNull } from 'drizzle-orm';
import { getDb, db as centralDb } from '../db';
import { scans, links, users } from '../db/schema';
import { scanQueue } from '../bullmq';
import { isFlareSolverrConfigured } from './flaresolverr';
import { parseScanConfig, scanCfBypassJobId } from './scan-queue';

export type ScanJobLike = {
  id?: string | number | null;
  data?: { scanId?: string; kind?: string };
};

export type ScanCompletionQueue = {
  /** Active/delayed jobs that still represent in-flight crawl work. Do not list waiting jobs (can be huge). */
  getBlockingJobs: () => Promise<ScanJobLike[]>;
  getWaitingCount?: () => Promise<number>;
  requeuePendingLinks?: (
    pending: Array<{ id: string; url: string; depth: number | null }>,
    scan: { id: string; config: unknown },
  ) => Promise<void>;
};

function isThisScanJob(job: ScanJobLike | null | undefined, scanId: string, currentJobId?: string): boolean {
  if (!job?.data || job.data.scanId !== scanId) return false;
  if (currentJobId != null && String(job.id) === String(currentJobId)) return false;
  return true;
}

async function setScanPhase(userDb: any, scanId: string, config: any, phase: 'crawling' | 'cloudflare') {
  const next = { ...config, phase };
  await userDb
    .update(scans)
    .set({ config: JSON.stringify(next), updatedAt: new Date() })
    .where(eq(scans.id, scanId));
  return next;
}

/**
 * Mark a RUNNING scan COMPLETED when there is no remaining crawl work.
 * PENDING links mean work is still queued or about to be queued.
 * Unsolved CHALLENGED links with bypass enabled enqueue one FlareSolverr pass first.
 */
export async function maybeCompleteScan(
  userDb: any,
  scanId: string,
  opts?: {
    currentJobId?: string;
    queue?: ScanCompletionQueue;
    requeueOrphans?: boolean;
    /** Sweep path: requeue missing PENDING jobs even if other scans still have waiting work. */
    forceRequeue?: boolean;
  },
): Promise<boolean> {
  const scan = await userDb.select().from(scans).where(eq(scans.id, scanId)).then((res: any[]) => res[0]);
  if (!scan || scan.status !== 'RUNNING') return false;

  const pendingExists = await userDb.select({ id: links.id })
    .from(links)
    .where(and(eq(links.scanId, scanId), eq(links.status, 'PENDING')))
    .limit(1);

  const rawJobs = opts?.queue ? await opts.queue.getBlockingJobs() : [];
  const hasUnknownInFlight = rawJobs.some((job) => job == null || !job.data);
  const blockingJobs = rawJobs.filter((job) => isThisScanJob(job, scanId, opts?.currentJobId));
  const hasInFlightWork = blockingJobs.length > 0;

  if (pendingExists.length > 0) {
    if (opts?.requeueOrphans && !hasInFlightWork && opts.queue?.requeuePendingLinks) {
      const waiting = await opts.queue.getWaitingCount?.() ?? 1;
      if (opts.forceRequeue || waiting === 0) {
        const pending = await userDb.select({ id: links.id, url: links.url, depth: links.depth })
          .from(links)
          .where(and(eq(links.scanId, scanId), eq(links.status, 'PENDING')));
        console.log(`Scan ${scanId} has ${pending.length} orphaned PENDING links. Re-enqueuing...`);
        await opts.queue.requeuePendingLinks(pending, scan);
      }
    }
    return false;
  }

  if (hasInFlightWork || hasUnknownInFlight) return false;

  const processingLeft = await userDb.select({ id: links.id })
    .from(links)
    .where(and(eq(links.scanId, scanId), eq(links.status, 'PROCESSING')))
    .limit(1);

  if (processingLeft.length > 0) {
    await userDb.update(links).set({ status: 'SUCCESS' }).where(and(
      eq(links.scanId, scanId),
      eq(links.status, 'PROCESSING'),
      isNotNull(links.statusCode),
    ));
    await userDb.update(links).set({
      status: 'SKIPPED',
      error: 'Abandoned after worker exited before storing a result',
      checkedAt: new Date(),
    }).where(and(eq(links.scanId, scanId), eq(links.status, 'PROCESSING')));
  }

  const config = parseScanConfig(scan.config);
  const bypassEnabled = !!config.bypassCloudflare && isFlareSolverrConfigured();

  // Never complete while a Cloudflare bypass pass is in flight.
  const cfJobId = scanCfBypassJobId(scanId);
  const cfJob = await scanQueue.getJob(cfJobId);
  if (cfJob) {
    const cfState = await cfJob.getState();
    if (
      cfState === 'waiting' ||
      cfState === 'active' ||
      cfState === 'delayed' ||
      cfState === 'waiting-children' ||
      cfState === 'prioritized'
    ) {
      console.log(`Scan ${scanId} waiting on Cloudflare bypass job (${cfState}).`);
      return false;
    }
  }

  if (bypassEnabled && !config.cloudflareBypassPassDone) {
    const unsolved = await userDb
      .select({ id: links.id })
      .from(links)
      .where(and(eq(links.scanId, scanId), eq(links.status, 'CHALLENGED')))
      .limit(1);

    if (unsolved.length > 0) {
      await setScanPhase(userDb, scanId, config, 'cloudflare');
      const jobId = cfJobId;
      const existing = await scanQueue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === 'waiting' || state === 'active' || state === 'delayed' || state === 'waiting-children' || state === 'prioritized') {
          console.log(`Scan ${scanId} waiting on Cloudflare bypass job (${state}).`);
          return false;
        }
        try {
          await existing.remove();
        } catch {
          /* ignore */
        }
      }

      console.log(`Scan ${scanId}: enqueueing Cloudflare bypass pass for remaining challenged URLs.`);
      await scanQueue.add(
        jobId,
        {
          userId: scan.userId,
          scanId,
          url: '',
          depth: 0,
          config: { ...config, phase: 'cloudflare' },
          kind: 'cf-bypass',
        },
        { jobId, priority: 20 },
      );
      return false;
    }
  }

  // Clear cloudflare phase if present before completing.
  if (config.phase === 'cloudflare') {
    await setScanPhase(userDb, scanId, config, 'crawling');
  }

  console.log(`Scan ${scanId} completed (no PENDING links and no in-flight jobs).`);
  await userDb.update(scans).set({ status: 'COMPLETED', updatedAt: new Date() }).where(eq(scans.id, scanId));

  try {
    if (scan.userId) {
      const otherRunning = await userDb.select({ id: scans.id })
        .from(scans)
        .where(eq(scans.status, 'RUNNING'))
        .limit(1);
      if (otherRunning.length === 0) {
        await centralDb.update(users).set({ hasActiveScan: false }).where(eq(users.id, scan.userId));
      }
    }
  } catch (err: any) {
    console.error(`Failed to clear hasActiveScan after completing scan ${scanId}:`, err?.message || err);
  }

  return true;
}

/** Sweep RUNNING scans with no remaining work. Used on worker startup and when the queue drains. */
export async function finalizeIdleRunningScans(
  createQueue?: (userId: string) => ScanCompletionQueue,
): Promise<number> {
  const activeUsers = await centralDb.select().from(users).where(eq(users.hasActiveScan, true));
  let completed = 0;

  for (const user of activeUsers) {
    const userDb = getDb(user.id);
    const queue = createQueue?.(user.id);
    const runningScans = await userDb.select({ id: scans.id }).from(scans).where(eq(scans.status, 'RUNNING'));
    for (const scan of runningScans) {
      const didComplete = await maybeCompleteScan(userDb, scan.id, {
        queue,
        requeueOrphans: true,
        forceRequeue: true,
      });
      if (didComplete) completed += 1;
    }
  }

  return completed;
}
