import { fetchResource, isCloudflareChallenge, type FetchedResource } from '@lynx/crawler-core';
import { cookiesToHeader, isFlareSolverrConfigured, solveWithFlareSolverr } from './flaresolverr';
import {
  fetchConfigWithSession,
  getHostSession,
  headersForHost,
  hostKeyFromUrl,
  reloadScanConfig,
  upsertHostSession,
  withHostSolveLock,
  type CloudflareHostSession,
} from './cf-sessions';

export type EagerUnlockResult = {
  resource: FetchedResource;
  liveConfig: any;
  solvedViaBypass: boolean;
  bypassAttempted: boolean;
};

type SolveBundle = {
  session: CloudflareHostSession | null;
  flareHtml?: string;
  flareStatus?: number;
  /** True when FlareSolverr was invoked (or a prior fail was cached) for this host. */
  solveTried: boolean;
};

/** In-process: avoid hammering FlareSolverr for every URL after a host solve fails. */
const hostSolveFailed = new Map<string, true>();

function failKey(scanId: string, host: string) {
  return `${scanId}:${host}`;
}

/** Test helper — clears the in-process failed-host cache. */
export function clearEagerHostSolveFailures() {
  hostSolveFailed.clear();
}

/**
 * After a Node fetch returned challenged=true: solve the host once via FlareSolverr
 * (if bypass is on), persist cookies, then retry with plain Node fetch.
 * Never calls FlareSolverr when the response was not challenged.
 *
 * On FlareSolverr failure, leaves bypassAttempted=false so the end-of-scan
 * safety net can still retry. Only marks bypassAttempted when a host session
 * was obtained and a cookie retry ran (success or still challenged).
 */
export async function tryEagerCloudflareUnlock(opts: {
  userDb: any;
  scanId: string;
  url: string;
  liveConfig: any;
  resource: FetchedResource;
  alreadyBypassAttempted?: boolean;
}): Promise<EagerUnlockResult> {
  const { userDb, scanId, url, resource } = opts;
  let liveConfig = opts.liveConfig;
  let bypassAttempted = !!opts.alreadyBypassAttempted;

  if (
    !resource.challenged ||
    !liveConfig?.bypassCloudflare ||
    !isFlareSolverrConfigured()
  ) {
    return { resource, liveConfig, solvedViaBypass: false, bypassAttempted };
  }

  const host = hostKeyFromUrl(url);
  if (!host) {
    return { resource, liveConfig, solvedViaBypass: false, bypassAttempted };
  }

  const bundle = await withHostSolveLock(scanId, host, async (): Promise<SolveBundle> => {
    liveConfig = (await reloadScanConfig(userDb, scanId)) || liveConfig;
    const existing = getHostSession(liveConfig, url);
    if (existing) return { session: existing, solveTried: true };

    if (hostSolveFailed.has(failKey(scanId, host))) {
      return { session: null, solveTried: true };
    }

    console.log(`[Cloudflare] Solving host ${host} via FlareSolverr for ${url}`);
    const solved = await solveWithFlareSolverr(url);
    if (!solved.ok || (solved.cookies.length === 0 && (solved.status == null || solved.status >= 400))) {
      console.log(`[Cloudflare] Solve failed for ${host}: ${solved.error || 'no cookies'}`);
      hostSolveFailed.set(failKey(scanId, host), true);
      return { session: null, solveTried: true };
    }
    hostSolveFailed.delete(failKey(scanId, host));
    liveConfig =
      (await upsertHostSession(userDb, scanId, host, {
        cookieHeader: cookiesToHeader(solved.cookies),
        userAgent: solved.userAgent,
      })) || liveConfig;
    return {
      session: getHostSession(liveConfig, url),
      flareHtml: solved.responseHtml,
      flareStatus: solved.status ?? 200,
      solveTried: true,
    };
  });

  // FlareSolverr failed — leave bypassAttempted false for the end-of-scan pass.
  if (!bundle.session) {
    return { resource, liveConfig, solvedViaBypass: false, bypassAttempted: false };
  }

  // Session obtained: cookie retry counts as a bypass attempt for this URL.
  bypassAttempted = true;

  liveConfig = (await reloadScanConfig(userDb, scanId)) || liveConfig;
  const retryHeaders = headersForHost(liveConfig, url);
  const retryConfig = fetchConfigWithSession(liveConfig, url);
  let retry = await fetchResource(url, retryConfig, retryHeaders);

  if (
    (retry.challenged || !retry.ok) &&
    bundle.flareHtml &&
    (bundle.flareStatus == null || bundle.flareStatus < 400) &&
    !isCloudflareChallenge(bundle.flareStatus ?? 200, {}, bundle.flareHtml)
  ) {
    console.log(`[Cloudflare] Trusting FlareSolverr HTML for ${url} (Node re-fetch looked challenged)`);
    retry = {
      ...retry,
      ok: true,
      challenged: false,
      authGated: false,
      statusCode: bundle.flareStatus ?? 200,
      contentType: retry.contentType || 'text/html',
      bodyText: bundle.flareHtml,
      error: null,
    };
  }

  if (!retry.challenged && retry.ok) {
    console.log(`[Cloudflare] Unlocked ${url} with saved host session`);
    return { resource: retry, liveConfig, solvedViaBypass: true, bypassAttempted };
  }
  if (!retry.challenged && !retry.blockedBySsrf) {
    return { resource: retry, liveConfig, solvedViaBypass: true, bypassAttempted };
  }

  return { resource, liveConfig, solvedViaBypass: false, bypassAttempted };
}
