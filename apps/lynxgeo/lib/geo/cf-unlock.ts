import {
  fetchResource,
  isCloudflareChallenge,
  parseChromiumNetErrorStatus,
  type CrawlConfig,
  type FetchedResource,
} from '@lynx/crawler-core';
import { cookiesToHeader, isFlareSolverrConfigured, solveWithFlareSolverr } from './flaresolverr';

export type CloudflareHostSession = {
  cookieHeader: string;
  userAgent?: string;
  solvedAt: string;
};

export type CloudflareSessionsMap = Record<string, CloudflareHostSession>;

export type GeoCfConfig = CrawlConfig & {
  bypassCloudflare?: boolean;
  /** Optional manual seed: paste browser Cookie header for the start host. */
  cookieHeader?: string;
  cloudflareSessions?: CloudflareSessionsMap;
};

/** In-process: avoid hammering FlareSolverr for every URL after a host solve fails. */
const hostSolveFailed = new Map<string, true>();
/** Hosts where Node+cookies still get challenged (common: FlareSolverr vs worker IP mismatch). */
const hostNodeCookieFails = new Map<string, true>();
const hostSolveChains = new Map<string, Promise<unknown>>();

function failKey(auditId: string, host: string) {
  return `${auditId}:${host}`;
}

export function hostKeyFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function getHostSession(config: GeoCfConfig, url: string): CloudflareHostSession | null {
  const host = hostKeyFromUrl(url);
  if (!host) return null;
  const sessions = (config.cloudflareSessions || {}) as CloudflareSessionsMap;
  const session = sessions[host];
  if (!session) return null;
  if (!session.cookieHeader && !session.userAgent) return null;
  return session;
}

export function headersForHost(config: GeoCfConfig, url: string): Record<string, string> {
  const session = getHostSession(config, url);
  if (!session) return {};
  const headers: Record<string, string> = {};
  if (session.cookieHeader) headers.Cookie = session.cookieHeader;
  if (session.userAgent) headers['User-Agent'] = session.userAgent;
  return headers;
}

export function fetchConfigWithSession(config: GeoCfConfig, url: string): GeoCfConfig {
  const session = getHostSession(config, url);
  if (!session?.userAgent) return config;
  return { ...config, customUserAgent: session.userAgent };
}

function withHostSolveLock<T>(auditId: string, host: string, fn: () => Promise<T>): Promise<T> {
  const key = `${auditId}:${host}`;
  const prev = hostSolveChains.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  hostSolveChains.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

export function upsertMemorySession(
  config: GeoCfConfig,
  host: string,
  session: Omit<CloudflareHostSession, 'solvedAt'> & { solvedAt?: string },
): GeoCfConfig {
  const sessions: CloudflareSessionsMap = { ...(config.cloudflareSessions || {}) };
  sessions[host] = {
    cookieHeader: session.cookieHeader || '',
    userAgent: session.userAgent,
    solvedAt: session.solvedAt || new Date().toISOString(),
  };
  return { ...config, cloudflareSessions: sessions };
}

/**
 * Seed cloudflareSessions from optional manual cookieHeader (+ customUserAgent).
 * Call once at audit start so the first fetch may already carry clearance cookies.
 */
export function seedManualCloudflareSession(config: GeoCfConfig): GeoCfConfig {
  const cookieHeader = typeof config.cookieHeader === 'string' ? config.cookieHeader.trim() : '';
  if (!cookieHeader) return config;
  const host = hostKeyFromUrl(config.startUrl);
  if (!host) return config;
  if (getHostSession(config, config.startUrl)) return config;
  return upsertMemorySession(config, host, {
    cookieHeader,
    userAgent: config.customUserAgent || config.userAgent,
  });
}

/** Default CF bypass on when FlareSolverr is reachable, unless the user set false. */
export function withGeoCloudflareDefaults(config: CrawlConfig): GeoCfConfig {
  let next: GeoCfConfig = { ...(config as GeoCfConfig) };
  if (next.bypassCloudflare === undefined && isFlareSolverrConfigured()) {
    next = { ...next, bypassCloudflare: true };
  }
  return seedManualCloudflareSession(next);
}

function trustFlareHtml(
  base: FetchedResource,
  flareHtml: string,
  flareStatus: number | undefined,
): FetchedResource {
  return {
    ...base,
    ok: true,
    challenged: false,
    authGated: false,
    statusCode: flareStatus ?? 200,
    contentType: base.contentType || 'text/html',
    bodyText: flareHtml,
    error: null,
  };
}

/**
 * Map FlareSolverr HTML to a resource.
 * - Chromium net-error interstitial (false HTTP 200) → ok:false with real status
 * - CF challenge / hard 4xx from Flare → null (caller keeps prior resource)
 * - Clean HTML → trusted ok:true
 */
function applyFlareHtml(
  base: FetchedResource,
  flareHtml: string | undefined,
  flareStatus: number | undefined,
): FetchedResource | null {
  if (!flareHtml) return null;

  const chromeStatus = parseChromiumNetErrorStatus(flareHtml);
  if (chromeStatus != null) {
    return {
      ...base,
      ok: false,
      challenged: false,
      authGated: false,
      statusCode: chromeStatus,
      contentType: base.contentType || 'text/html',
      bodyText: flareHtml,
      error: `[Status] HTTP ${chromeStatus}`,
    };
  }

  if (flareStatus != null && flareStatus >= 400) return null;
  if (isCloudflareChallenge(flareStatus ?? 200, {}, flareHtml)) return null;
  return trustFlareHtml(base, flareHtml, flareStatus);
}

async function solveUrlViaFlare(
  url: string,
  host: string,
  liveConfig: GeoCfConfig,
  auditId: string,
  log: (line: string) => void,
): Promise<{ config: GeoCfConfig; html?: string; status?: number; ok: boolean }> {
  if (hostSolveFailed.has(failKey(auditId, host))) {
    return { config: liveConfig, ok: false };
  }

  log(`[Cloudflare] Solving via FlareSolverr for ${url}`);
  const solved = await solveWithFlareSolverr(url);
  if (!solved.ok || (solved.cookies.length === 0 && (solved.status == null || solved.status >= 400))) {
    log(`[Cloudflare] Solve failed for ${host}: ${solved.error || 'no cookies'}`);
    hostSolveFailed.set(failKey(auditId, host), true);
    return { config: liveConfig, ok: false };
  }

  hostSolveFailed.delete(failKey(auditId, host));
  const next = upsertMemorySession(liveConfig, host, {
    cookieHeader: cookiesToHeader(solved.cookies),
    userAgent: solved.userAgent,
  });

  return {
    config: next,
    html: solved.responseHtml,
    status: solved.status ?? 200,
    ok: true,
  };
}

export type GeoUnlockResult = {
  resource: FetchedResource;
  config: GeoCfConfig;
  solvedViaBypass: boolean;
};

/**
 * Fetch a URL with any saved host cookies. If Cloudflare challenges the response
 * and bypass is enabled, solve via FlareSolverr.
 *
 * Important: FlareSolverr cookies are often IP-bound to the solver container, so
 * Node re-fetch from the worker may still be challenged. When that happens we
 * re-solve the *current* URL and trust FlareSolverr's HTML (same as LynxScan's
 * HTML-trust fallback, but per URL when cookies do not transfer).
 */
export async function fetchGeoResource(
  url: string,
  config: GeoCfConfig,
  auditId: string,
  log: (line: string) => void = () => {},
  extraHeaders?: Record<string, string>,
): Promise<GeoUnlockResult> {
  let liveConfig = config;
  const host = hostKeyFromUrl(url);
  const sessionHeaders = headersForHost(liveConfig, url);
  const mergedExtras = { ...sessionHeaders, ...extraHeaders };
  const fetchConfig = fetchConfigWithSession(liveConfig, url);
  let resource = await fetchResource(url, fetchConfig, Object.keys(mergedExtras).length ? mergedExtras : undefined);

  if (
    !resource.challenged ||
    !liveConfig.bypassCloudflare ||
    !isFlareSolverrConfigured() ||
    !host
  ) {
    return { resource, config: liveConfig, solvedViaBypass: false };
  }

  const skipNodeRetry = hostNodeCookieFails.has(failKey(auditId, host));

  // Fast path when we already know Node+cookies fail for this host: FlareSolverr HTML only.
  if (skipNodeRetry) {
    const solved = await withHostSolveLock(auditId, host, () =>
      solveUrlViaFlare(url, host, liveConfig, auditId, log),
    );
    liveConfig = solved.config;
    if (solved.ok) {
      const interpreted = applyFlareHtml(resource, solved.html, solved.status);
      if (interpreted) {
        if (interpreted.ok) {
          log(`[Cloudflare] Trusting FlareSolverr HTML for ${url} (host requires FlareSolverr fetch)`);
        } else {
          log(
            `[Cloudflare] FlareSolverr returned HTTP ${interpreted.statusCode} for ${url} (Chromium error page)`,
          );
        }
        return { resource: interpreted, config: liveConfig, solvedViaBypass: true };
      }
    }
    return { resource, config: liveConfig, solvedViaBypass: false };
  }

  // Ensure we have cookies (first challenge on this host).
  if (!getHostSession(liveConfig, url)) {
    const solved = await withHostSolveLock(auditId, host, () =>
      solveUrlViaFlare(url, host, liveConfig, auditId, log),
    );
    liveConfig = solved.config;
    if (solved.ok) {
      // Prefer trusting this URL's Flare HTML immediately; also try Node below for later pages.
      const retryHeaders = { ...headersForHost(liveConfig, url), ...extraHeaders };
      const retryConfig = fetchConfigWithSession(liveConfig, url);
      const retry = await fetchResource(url, retryConfig, retryHeaders);
      if (!retry.challenged && (retry.ok || !retry.blockedBySsrf)) {
        log(`[Cloudflare] Unlocked ${url} with FlareSolverr cookies`);
        return { resource: retry, config: liveConfig, solvedViaBypass: true };
      }
      hostNodeCookieFails.set(failKey(auditId, host), true);
      const interpreted = applyFlareHtml(retry, solved.html, solved.status);
      if (interpreted) {
        if (interpreted.ok) {
          log(`[Cloudflare] Trusting FlareSolverr HTML for ${url} (Node re-fetch looked challenged)`);
        } else {
          log(
            `[Cloudflare] FlareSolverr returned HTTP ${interpreted.statusCode} for ${url} (Chromium error page)`,
          );
        }
        return { resource: interpreted, config: liveConfig, solvedViaBypass: true };
      }
    }
    return { resource, config: liveConfig, solvedViaBypass: false };
  }

  // Session exists: try Node+cookies, then FlareSolverr HTML for this URL if still challenged.
  const retryHeaders = { ...headersForHost(liveConfig, url), ...extraHeaders };
  const retryConfig = fetchConfigWithSession(liveConfig, url);
  let retry = await fetchResource(url, retryConfig, retryHeaders);
  if (!retry.challenged && (retry.ok || !retry.blockedBySsrf)) {
    log(`[Cloudflare] Unlocked ${url} with saved host session`);
    return { resource: retry, config: liveConfig, solvedViaBypass: true };
  }

  hostNodeCookieFails.set(failKey(auditId, host), true);
  const solved = await withHostSolveLock(auditId, host, () =>
    solveUrlViaFlare(url, host, liveConfig, auditId, log),
  );
  liveConfig = solved.config;
  if (solved.ok) {
    const interpreted = applyFlareHtml(retry, solved.html, solved.status);
    if (interpreted) {
      if (interpreted.ok) {
        log(
          `[Cloudflare] Trusting FlareSolverr HTML for ${url} (saved cookies did not unlock Node fetch)`,
        );
      } else {
        log(
          `[Cloudflare] FlareSolverr returned HTTP ${interpreted.statusCode} for ${url} (Chromium error page)`,
        );
      }
      return { resource: interpreted, config: liveConfig, solvedViaBypass: true };
    }
  }

  return { resource, config: liveConfig, solvedViaBypass: false };
}
