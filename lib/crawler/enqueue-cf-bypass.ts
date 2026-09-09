import { and, eq, inArray } from 'drizzle-orm';
import { links, scans, users } from '../db/schema';
import { db as centralDb } from '../db';
import { scanQueue } from '../bullmq';
import { isFlareSolverrConfigured } from './flaresolverr';
import { parseScanConfig, scanCfBypassJobId } from './scan-queue';

/**
 * Reset CHALLENGED links for a fresh FlareSolverr pass and enqueue the bypass job.
 * Clears saved host sessions so solves are not reused from a failed attempt.
 */
export async function enqueueManualCloudflareBypass(opts: {
  userDb: any;
  userId: string;
  scanId: string;
  /** When set, only reset these link URLs (all instances of each URL in the scan). */
  urls?: string[];
}): Promise<{ ok: true; count: number } | { ok: false; error: string; status: number }> {
  if (!isFlareSolverrConfigured()) {
    return {
      ok: false,
      error: 'FlareSolverr is not configured. Set FLARESOLVERR_URL and ensure the container is running.',
      status: 400,
    };
  }

  const { userDb, userId, scanId } = opts;
  const scan = await userDb.select().from(scans).where(eq(scans.id, scanId)).then((rows: any[]) => rows[0]);
  if (!scan) {
    return { ok: false, error: 'Scan not found', status: 404 };
  }

  // Check job state BEFORE mutating links/config — avoid leaving a half-reset scan on 409.
  const jobId = scanCfBypassJobId(scanId);
  const existing = await scanQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'waiting' || state === 'active' || state === 'delayed' || state === 'waiting-children' || state === 'prioritized') {
      return { ok: false, error: 'A Cloudflare bypass pass is already running for this scan.', status: 409 };
    }
    try {
      await existing.remove();
    } catch {
      /* ignore */
    }
  }

  let challenged = await userDb
    .select()
    .from(links)
    .where(and(eq(links.scanId, scanId), eq(links.status, 'CHALLENGED')));

  if (opts.urls && opts.urls.length > 0) {
    const urlSet = new Set(opts.urls);
    challenged = challenged.filter((l: any) => urlSet.has(l.url));
  }

  if (challenged.length === 0) {
    return { ok: true, count: 0 };
  }

  const hosts = new Set<string>();
  for (const row of challenged) {
    try {
      hosts.add(new URL(row.url).hostname.toLowerCase());
    } catch {
      /* ignore */
    }
  }

  const config = parseScanConfig(scan.config);
  const sessions = { ...(config.cloudflareSessions || {}) };
  for (const host of hosts) {
    delete sessions[host];
  }

  const nextConfig = {
    ...config,
    bypassCloudflare: true,
    cloudflareSessions: sessions,
    phase: 'cloudflare' as const,
    cloudflareBypassPassDone: false,
  };

  const challengedIds = challenged.map((l: any) => l.id);
  // Do NOT set isRechecked here — that flag is for successful unlocks / finished rechecks.
  // Premature isRechecked puts still-CHALLENGED URLs into the Re-checked tab.
  await userDb
    .update(links)
    .set({
      bypassAttempted: false,
      error: 'Failed Cloudflare Challenge',
      cloudflareChallenge: true,
      checkedAt: null,
    })
    .where(inArray(links.id, challengedIds));

  await userDb
    .update(scans)
    .set({
      status: 'RUNNING',
      config: JSON.stringify(nextConfig),
      updatedAt: new Date(),
    })
    .where(eq(scans.id, scanId));

  await centralDb.update(users).set({ hasActiveScan: true }).where(eq(users.id, userId));

  await scanQueue.add(
    jobId,
    {
      userId,
      scanId,
      url: '',
      depth: 0,
      config: nextConfig,
      kind: 'cf-bypass',
    },
    { jobId, priority: 5 },
  );

  return { ok: true, count: challenged.length };
}
