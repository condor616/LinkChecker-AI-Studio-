import { eq } from 'drizzle-orm';
import { scans } from '../db/schema';
import { parseScanConfig } from './scan-queue';

export type CloudflareHostSession = {
  cookieHeader: string;
  userAgent?: string;
  solvedAt: string;
};

export type CloudflareSessionsMap = Record<string, CloudflareHostSession>;

/** Hostname key used in scan.config.cloudflareSessions */
export function hostKeyFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function getHostSession(config: any, url: string): CloudflareHostSession | null {
  const host = hostKeyFromUrl(url);
  if (!host) return null;
  const sessions = (config?.cloudflareSessions || {}) as CloudflareSessionsMap;
  const session = sessions[host];
  if (!session) return null;
  if (!session.cookieHeader && !session.userAgent) return null;
  return session;
}

/** Cookie + UA headers for Node fetch when a host session already exists. */
export function headersForHost(config: any, url: string): Record<string, string> {
  const session = getHostSession(config, url);
  if (!session) return {};
  const headers: Record<string, string> = {};
  if (session.cookieHeader) headers.Cookie = session.cookieHeader;
  if (session.userAgent) headers['User-Agent'] = session.userAgent;
  return headers;
}

export function fetchConfigWithSession(config: any, url: string): any {
  const session = getHostSession(config, url);
  if (!session?.userAgent) return config;
  return { ...config, customUserAgent: session.userAgent };
}

/** Serialize concurrent solves for the same scan+host. */
const hostSolveChains = new Map<string, Promise<unknown>>();

export function withHostSolveLock<T>(scanId: string, host: string, fn: () => Promise<T>): Promise<T> {
  const key = `${scanId}:${host}`;
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

/**
 * Persist a FlareSolverr session on scan.config.cloudflareSessions[host].
 * Returns the updated config object (parsed).
 */
export async function upsertHostSession(
  userDb: any,
  scanId: string,
  host: string,
  session: Omit<CloudflareHostSession, 'solvedAt'> & { solvedAt?: string },
): Promise<any> {
  const row = await userDb.select().from(scans).where(eq(scans.id, scanId)).then((r: any[]) => r[0]);
  if (!row) return null;

  const config = parseScanConfig(row.config);
  const sessions: CloudflareSessionsMap = { ...(config.cloudflareSessions || {}) };
  sessions[host] = {
    cookieHeader: session.cookieHeader || '',
    userAgent: session.userAgent,
    solvedAt: session.solvedAt || new Date().toISOString(),
  };
  const next = { ...config, cloudflareSessions: sessions };
  await userDb
    .update(scans)
    .set({ config: JSON.stringify(next), updatedAt: new Date() })
    .where(eq(scans.id, scanId));
  return next;
}

/** Reload scan config from DB (picks up sessions written by other jobs). */
export async function reloadScanConfig(userDb: any, scanId: string): Promise<any> {
  const row = await userDb.select({ config: scans.config }).from(scans).where(eq(scans.id, scanId)).limit(1);
  return parseScanConfig(row[0]?.config);
}
