import { and, eq } from 'drizzle-orm';
import crypto from 'crypto';
import {
  canonicalizeScanUrl,
  discoverLinks,
  FAILED_CLOUDFLARE_CHALLENGE,
  formatChallengeError,
  fetchResource,
  getUrlWithoutHash,
  isCloudflareChallenge,
} from '@lynx/crawler-core';
import { getDb } from '../db';
import { links, scans } from '../db/schema';
import { scanQueue } from '../bullmq';
import { cookiesToHeader, isFlareSolverrConfigured, solveWithFlareSolverr } from './flaresolverr';
import {
  fetchConfigWithSession,
  getHostSession,
  headersForHost,
  upsertHostSession,
} from './cf-sessions';
import { parseScanConfig, toBulkJobs } from './scan-queue';
import { maybeCompleteScan, type ScanCompletionQueue } from './scan-completion';

/**
 * End-of-scan / manual safety net: all remaining CHALLENGED URLs for this scan.
 * Prefers sessions already on scan.config; writes new sessions back for later Node jobs.
 * Marks cloudflareBypassPassDone when finished with no new discoveries so completion
 * does not loop forever on permanently blocked hosts.
 */
export async function processCloudflareBypassJob(opts: {
  userId: string;
  scanId: string;
  queue?: ScanCompletionQueue;
  currentJobId?: string;
}): Promise<void> {
  const { userId, scanId } = opts;
  const userDb = getDb(userId);

  const scan = await userDb.select().from(scans).where(eq(scans.id, scanId)).then((rows: any[]) => rows[0]);
  if (!scan || scan.status !== 'RUNNING') return;

  let config = parseScanConfig(scan.config);
  const newlyDiscovered: any[] = [];

  const challenged = await userDb
    .select()
    .from(links)
    .where(and(eq(links.scanId, scanId), eq(links.status, 'CHALLENGED')));

  // Group by hostname so we solve once per host.
  const byHost = new Map<string, any[]>();
  for (const row of challenged) {
    let host = '';
    try {
      host = new URL(row.url).hostname.toLowerCase();
    } catch {
      host = row.url;
    }
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host)!.push(row);
  }

  for (const [host, rows] of byHost) {
    const stillRunning = await userDb.select({ status: scans.status }).from(scans).where(eq(scans.id, scanId)).limit(1);
    if (stillRunning[0]?.status !== 'RUNNING') break;

    // Prefer session already persisted on the scan (from eager solve).
    let session = getHostSession(config, `https://${host}/`);
    /** FlareSolverr HTML for the URL that was solved on this host (same URL only). */
    let flarePage: { url: string; status: number; html: string } | null = null;

    for (const row of rows) {
      const current = await userDb.select().from(links).where(eq(links.id, row.id)).limit(1).then((r: any[]) => r[0]);
      if (!current || current.status !== 'CHALLENGED') continue;

      if (!isFlareSolverrConfigured()) {
        await userDb
          .update(links)
          .set({
            bypassAttempted: true,
            error: FAILED_CLOUDFLARE_CHALLENGE,
            checkedAt: new Date(),
          })
          .where(eq(links.id, current.id));
        continue;
      }

      if (!session) {
        console.log(`[Cloudflare bypass] Solving host ${host} via FlareSolverr for ${current.url}`);
        const solved = await solveWithFlareSolverr(current.url);

        const stillAfterSolve = await userDb
          .select({ status: scans.status })
          .from(scans)
          .where(eq(scans.id, scanId))
          .limit(1);
        if (stillAfterSolve[0]?.status !== 'RUNNING') break;

        if (!solved.ok || (solved.cookies.length === 0 && (solved.status == null || solved.status >= 400))) {
          console.log(`[Cloudflare bypass] Solve failed for ${host}: ${solved.error || 'no cookies'}`);
          for (const r of rows) {
            await userDb
              .update(links)
              .set({
                bypassAttempted: true,
                cloudflareChallenge: true,
                status: 'CHALLENGED',
                error: FAILED_CLOUDFLARE_CHALLENGE,
                checkedAt: new Date(),
              })
              .where(eq(links.id, r.id));
          }
          session = null;
          break;
        }
        // FlareSolverr may return ok with 0 cookies when no JS challenge was needed;
        // still persist UA so Node retry can match the browser profile.
        config =
          (await upsertHostSession(userDb, scanId, host, {
            cookieHeader: cookiesToHeader(solved.cookies),
            userAgent: solved.userAgent,
          })) || config;
        session = getHostSession(config, current.url);
        if (solved.responseHtml && (solved.status == null || solved.status < 400)) {
          flarePage = {
            url: current.url,
            status: solved.status ?? 200,
            html: solved.responseHtml,
          };
        }
      }

      if (!session) continue;

      const extraHeaders = headersForHost(config, current.url);
      const fetchConfig = fetchConfigWithSession(config, current.url);
      let resource = await fetchResource(current.url, fetchConfig, extraHeaders);

      // FlareSolverr already returned a clean page for this URL, but Node re-fetch
      // may false-positive because the site is merely hosted on Cloudflare CDN.
      if (
        (resource.challenged || !resource.ok) &&
        flarePage &&
        flarePage.url === current.url &&
        flarePage.html &&
        !isCloudflareChallenge(flarePage.status, {}, flarePage.html)
      ) {
        console.log(`[Cloudflare bypass] Trusting FlareSolverr HTML for ${current.url} (Node re-fetch looked challenged)`);
        resource = {
          ...resource,
          ok: true,
          challenged: false,
          authGated: false,
          statusCode: flarePage.status,
          contentType: resource.contentType || 'text/html',
          bodyText: flarePage.html,
          error: null,
        };
      }

      if (resource.challenged || !resource.ok) {
        await userDb
          .update(links)
          .set({
            status: 'CHALLENGED',
            statusCode: resource.statusCode,
            type: resource.contentType || null,
            error: formatChallengeError({
              statusCode: resource.statusCode,
              headers: resource.headers,
              bodyPreview: resource.bodyText,
              note: resource.challenged
                ? 'Still challenged after FlareSolverr cookies'
                : 'Node fetch failed after FlareSolverr unlock',
            }),
            cloudflareChallenge: true,
            bypassAttempted: true,
            checkedAt: new Date(),
          })
          .where(eq(links.id, current.id));
        continue;
      }

      await userDb
        .update(links)
        .set({
          status: 'SUCCESS',
          statusCode: resource.statusCode,
          type: resource.contentType || null,
          error: null,
          cloudflareChallenge: true,
          bypassAttempted: true,
          isRechecked: true,
          checkedAt: new Date(),
        })
        .where(eq(links.id, current.id));

      const maxDepth = config.maxDepth !== undefined ? config.maxDepth : 2;
      const currentDepth = current.depth || 0;
      const canTraverse =
        !!resource.bodyText &&
        (resource.contentType || '').includes('text/html') &&
        (maxDepth === 0 || currentDepth < maxDepth);

      if (canTraverse) {
        const discovered = discoverLinks(resource.bodyText!, current.url, config, currentDepth);
        for (const found of discovered) {
          const urlStr = canonicalizeScanUrl(found.url);
          const existing = await userDb
            .select({ id: links.id })
            .from(links)
            .where(and(eq(links.scanId, scanId), eq(links.url, urlStr)))
            .limit(1);
          if (existing.length > 0) continue;

          const newLink = {
            id: crypto.randomUUID(),
            scanId,
            url: urlStr,
            parentUrl: found.parentUrl,
            status: 'PENDING' as const,
            depth: found.depth,
            snippet: found.snippet,
            checkedAt: null,
            statusCode: null,
            error: null,
            type: null,
            cloudflareChallenge: false,
            bypassAttempted: false,
            isRechecked: false,
          };
          await userDb.insert(links).values(newLink);
          newlyDiscovered.push(newLink);

          const doc = getUrlWithoutHash(urlStr);
          if (doc !== urlStr) {
            const docExisting = await userDb
              .select({ id: links.id })
              .from(links)
              .where(and(eq(links.scanId, scanId), eq(links.url, doc)))
              .limit(1);
            if (docExisting.length === 0) {
              const docLink = {
                ...newLink,
                id: crypto.randomUUID(),
                url: doc,
                snippet: null,
              };
              await userDb.insert(links).values(docLink);
              newlyDiscovered.push(docLink);
            }
          }
        }
      }
    }
  }

  // Reload config so cloudflareSessions from upserts are kept when clearing phase.
  const latest = await userDb.select({ config: scans.config }).from(scans).where(eq(scans.id, scanId)).limit(1);
  const latestConfig = parseScanConfig(latest[0]?.config);
  // If we discovered more pages, leave passDone false so another end pass can run
  // after that crawl wave. Otherwise seal the pass so leftover CHALLENGED don't loop.
  const nextConfig = {
    ...latestConfig,
    phase: 'crawling' as const,
    cloudflareBypassPassDone: newlyDiscovered.length === 0,
  };

  if (newlyDiscovered.length > 0) {
    await userDb
      .update(scans)
      .set({ config: JSON.stringify(nextConfig), updatedAt: new Date() })
      .where(eq(scans.id, scanId));
    await scanQueue.addBulk(toBulkJobs(userId, scanId, nextConfig, newlyDiscovered));
  } else {
    await userDb
      .update(scans)
      .set({ config: JSON.stringify(nextConfig), updatedAt: new Date() })
      .where(eq(scans.id, scanId));
  }

  await maybeCompleteScan(userDb, scanId, {
    currentJobId: opts.currentJobId,
    queue: opts.queue,
    requeueOrphans: true,
  });
}
