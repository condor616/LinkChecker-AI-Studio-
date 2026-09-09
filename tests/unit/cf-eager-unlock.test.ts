import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FetchedResource } from '@lynx/crawler-core';

const fetchResource = vi.fn();
const solveWithFlareSolverr = vi.fn();
const isFlareSolverrConfigured = vi.fn(() => true);

vi.mock('@lynx/crawler-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lynx/crawler-core')>();
  return {
    ...actual,
    fetchResource: (...args: unknown[]) => fetchResource(...args),
  };
});

vi.mock('@/lib/crawler/flaresolverr', () => ({
  isFlareSolverrConfigured: () => isFlareSolverrConfigured(),
  solveWithFlareSolverr: (...args: unknown[]) => solveWithFlareSolverr(...args),
  cookiesToHeader: (cookies: Array<{ name: string; value: string }>) =>
    cookies.map((c) => `${c.name}=${c.value}`).join('; '),
}));

import { tryEagerCloudflareUnlock, clearEagerHostSolveFailures } from '@/lib/crawler/cf-eager';

function challengedResource(): FetchedResource {
  return {
    url: 'https://cf.example/',
    fetchUrl: 'https://cf.example/',
    ok: false,
    statusCode: 403,
    contentType: 'text/html',
    headers: { 'cf-ray': 'abc', server: 'cloudflare' },
    bodyText: '<html>Just a moment...</html>',
    blockedBySsrf: false,
    authGated: false,
    challenged: true,
    skipReason: null,
    error: 'Failed Cloudflare Challenge',
  };
}

function successResource(): FetchedResource {
  return {
    url: 'https://cf.example/',
    fetchUrl: 'https://cf.example/',
    ok: true,
    statusCode: 200,
    contentType: 'text/html',
    headers: {},
    bodyText: '<html><a href="/about">About</a></html>',
    blockedBySsrf: false,
    authGated: false,
    challenged: false,
    skipReason: null,
    error: null,
  };
}

describe('tryEagerCloudflareUnlock', () => {
  const prevEnv = process.env.FLARESOLVERR_URL;
  let storedConfig: any;

  const userDb = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ config: JSON.stringify(storedConfig) }],
          then: (fn: (rows: any[]) => any) => Promise.resolve(fn([{ config: JSON.stringify(storedConfig) }])),
        }),
        then: (fn: (rows: any[]) => any) => Promise.resolve(fn([{ config: JSON.stringify(storedConfig) }])),
      }),
    }),
    update: () => ({
      set: (next: any) => ({
        where: async () => {
          if (next.config) storedConfig = JSON.parse(next.config);
          return [];
        },
      }),
    }),
  };

  // Drizzle-style chain is awkward to mock; override with a simpler fake that
  // matches how reloadScanConfig / upsertHostSession call the db.
  beforeEach(() => {
    process.env.FLARESOLVERR_URL = 'http://localhost:8191/v1';
    isFlareSolverrConfigured.mockReturnValue(true);
    fetchResource.mockReset();
    solveWithFlareSolverr.mockReset();
    clearEagerHostSolveFailures();
    storedConfig = {
      startUrl: 'https://cf.example/',
      bypassCloudflare: true,
      cloudflareSessions: {},
    };

    (userDb as any).select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const rows = [{ id: 'scan-1', config: JSON.stringify(storedConfig) }];
          const promise = Promise.resolve(rows);
          return Object.assign(promise, {
            limit: vi.fn(async () => [{ config: JSON.stringify(storedConfig) }]),
            then: promise.then.bind(promise),
          });
        }),
      })),
    }));
    (userDb as any).update = vi.fn(() => ({
      set: vi.fn((next: any) => ({
        where: vi.fn(async () => {
          if (typeof next.config === 'string') {
            storedConfig = JSON.parse(next.config);
          }
          return [];
        }),
      })),
    }));
  });

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.FLARESOLVERR_URL;
    else process.env.FLARESOLVERR_URL = prevEnv;
  });

  it('does not call FlareSolverr when the URL was not challenged', async () => {
    const ok = successResource();
    const result = await tryEagerCloudflareUnlock({
      userDb,
      scanId: 'scan-1',
      url: 'https://cf.example/',
      liveConfig: storedConfig,
      resource: ok,
    });

    expect(solveWithFlareSolverr).not.toHaveBeenCalled();
    expect(fetchResource).not.toHaveBeenCalled();
    expect(result.solvedViaBypass).toBe(false);
    expect(result.resource).toBe(ok);
  });

  it('does not call FlareSolverr when bypassCloudflare is off', async () => {
    storedConfig.bypassCloudflare = false;
    const result = await tryEagerCloudflareUnlock({
      userDb,
      scanId: 'scan-1',
      url: 'https://cf.example/',
      liveConfig: storedConfig,
      resource: challengedResource(),
    });

    expect(solveWithFlareSolverr).not.toHaveBeenCalled();
    expect(result.resource.challenged).toBe(true);
  });

  it('solves once then retries with Node fetch + cookies', async () => {
    solveWithFlareSolverr.mockResolvedValue({
      ok: true,
      cookies: [{ name: 'cf_clearance', value: 'tok' }],
      userAgent: 'FlareUA',
    });
    fetchResource.mockResolvedValue(successResource());

    const result = await tryEagerCloudflareUnlock({
      userDb,
      scanId: 'scan-1',
      url: 'https://cf.example/',
      liveConfig: storedConfig,
      resource: challengedResource(),
    });

    expect(solveWithFlareSolverr).toHaveBeenCalledTimes(1);
    expect(fetchResource).toHaveBeenCalledTimes(1);
    const headers = fetchResource.mock.calls[0][2];
    expect(headers.Cookie).toContain('cf_clearance=tok');
    expect(result.solvedViaBypass).toBe(true);
    expect(result.bypassAttempted).toBe(true);
    expect(result.resource.ok).toBe(true);
    expect(storedConfig.cloudflareSessions['cf.example'].cookieHeader).toContain('cf_clearance=tok');
  });

  it('leaves bypassAttempted false when FlareSolverr fails so end-of-scan can retry', async () => {
    solveWithFlareSolverr.mockResolvedValue({
      ok: false,
      cookies: [],
      userAgent: '',
      error: 'Challenge not solved',
    });

    const result = await tryEagerCloudflareUnlock({
      userDb,
      scanId: 'scan-1',
      url: 'https://cf.example/',
      liveConfig: storedConfig,
      resource: challengedResource(),
    });

    expect(result.solvedViaBypass).toBe(false);
    expect(result.bypassAttempted).toBe(false);
    expect(result.resource.challenged).toBe(true);
    expect(fetchResource).not.toHaveBeenCalled();
  });

  it('reuses an existing host session without a second FlareSolverr solve', async () => {
    storedConfig.cloudflareSessions = {
      'cf.example': {
        cookieHeader: 'cf_clearance=existing',
        userAgent: 'FlareUA',
        solvedAt: new Date().toISOString(),
      },
    };
    fetchResource.mockResolvedValue(successResource());

    const result = await tryEagerCloudflareUnlock({
      userDb,
      scanId: 'scan-1',
      url: 'https://cf.example/about',
      liveConfig: storedConfig,
      resource: challengedResource(),
    });

    expect(solveWithFlareSolverr).not.toHaveBeenCalled();
    expect(fetchResource).toHaveBeenCalledTimes(1);
    expect(fetchResource.mock.calls[0][2].Cookie).toBe('cf_clearance=existing');
    expect(result.solvedViaBypass).toBe(true);
  });
});
