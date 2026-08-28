import { eq, and, isNotNull } from 'drizzle-orm';
import { getDb, db as centralDb } from '../db';
import { scans, links, users } from '../db/schema';

export type ScanJobLike = {
  id?: string | number | null;
  data?: { scanId?: string };
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

function isThisScanJob(job: ScanJobLike, scanId: string, currentJobId?: string): boolean {
  if (job.data?.scanId !== scanId) return false;
  if (currentJobId != null && String(job.id) === String(currentJobId)) return false;
  return true;
}

/**
 * Mark a RUNNING scan COMPLETED when there is no remaining crawl work.
 * PENDING links mean work is still queued or about to be queued.
 * PROCESSING leftovers (races / crashed workers) do not block completion once this
 * scan has no other active/delayed jobs.
 */
export async function maybeCompleteScan(
  userDb: any,
  scanId: string,
  opts?: { currentJobId?: string; queue?: ScanCompletionQueue; requeueOrphans?: boolean },
): Promise<boolean> {
  const scan = await userDb.select().from(scans).where(eq(scans.id, scanId)).then((res: any[]) => res[0]);
  if (!scan || scan.status !== 'RUNNING') return false;

  const pendingExists = await userDb.select({ id: links.id })
    .from(links)
    .where(and(eq(links.scanId, scanId), eq(links.status, 'PENDING')))
    .limit(1);

  const blockingJobs = opts?.queue
    ? (await opts.queue.getBlockingJobs()).filter((job) => isThisScanJob(job, scanId, opts.currentJobId))
    : [];
  const hasInFlightWork = blockingJobs.length > 0;

  if (pendingExists.length > 0) {
    if (opts?.requeueOrphans && !hasInFlightWork && opts.queue?.requeuePendingLinks) {
      const waiting = await opts.queue.getWaitingCount?.() ?? 1;
      if (waiting === 0) {
        const pending = await userDb.select({ id: links.id, url: links.url, depth: links.depth })
          .from(links)
          .where(and(eq(links.scanId, scanId), eq(links.status, 'PENDING')));
        console.log(`Scan ${scanId} has ${pending.length} orphaned PENDING links. Re-enqueuing...`);
        await opts.queue.requeuePendingLinks(pending, scan);
      }
    }
    return false;
  }

  if (hasInFlightWork) return false;

  const processingLeft = await userDb.select({ id: links.id })
    .from(links)
    .where(and(eq(links.scanId, scanId), eq(links.status, 'PROCESSING')))
    .limit(1);

  if (processingLeft.length > 0) {
    // Restore rows that were fetched then overwritten back to PROCESSING by a duplicate job.
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

  console.log(`Scan ${scanId} completed (no PENDING links and no in-flight jobs).`);
  await userDb.update(scans).set({ status: 'COMPLETED', updatedAt: new Date() }).where(eq(scans.id, scanId));
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
      const didComplete = await maybeCompleteScan(userDb, scan.id, { queue, requeueOrphans: true });
      if (didComplete) completed += 1;
    }
  }

  return completed;
}
