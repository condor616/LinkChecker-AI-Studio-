import { assertSafeOutboundUrl } from '@lynx/crawler-core';

export type FlareSolverrCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
};

export type FlareSolverrSolveResult = {
  ok: boolean;
  status?: number;
  cookies: FlareSolverrCookie[];
  userAgent?: string;
  solutionUrl?: string;
  /** HTML returned by FlareSolverr's browser (useful when Node re-fetch false-positives). */
  responseHtml?: string;
  error?: string;
};

function getFlareSolverrUrl(): string | null {
  const raw = (process.env.FLARESOLVERR_URL || '').trim();
  if (raw) return raw.replace(/\/+$/, '');
  // Empty FLARESOLVERR_URL= in dotenv/shell blocks loading a later .env value.
  // Local Compose publishes FlareSolverr on 8191 for `npm run dev` / `dev:all`.
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:8191/v1';
  }
  return null;
}

export function isFlareSolverrConfigured(): boolean {
  return Boolean(getFlareSolverrUrl());
}

/** Serialize FlareSolverr solves so concurrency does not stampede Chrome. */
let solverChain: Promise<unknown> = Promise.resolve();

function withSolverLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = solverChain.then(fn, fn);
  solverChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function cookiesToHeader(cookies: FlareSolverrCookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * Ask FlareSolverr to solve a URL (JS challenge). Returns cookies + UA for reuse on Node fetch.
 * Never throws for solver/HTTP failures — returns { ok: false, error }.
 */
export async function solveWithFlareSolverr(
  url: string,
  maxTimeoutMs = 60000,
  options?: { startUrl?: string },
): Promise<FlareSolverrSolveResult> {
  const endpoint = getFlareSolverrUrl();
  if (!endpoint) {
    return { ok: false, cookies: [], error: 'FLARESOLVERR_URL is not configured' };
  }

  const safety = await assertSafeOutboundUrl(url, { startUrl: options?.startUrl });
  if (!safety.ok) {
    return { ok: false, cookies: [], error: `FlareSolverr blocked: ${safety.reason}` };
  }

  return withSolverLock(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), maxTimeoutMs + 5000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          cmd: 'request.get',
          url,
          maxTimeout: maxTimeoutMs,
        }),
      });

      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data) {
        return { ok: false, cookies: [], error: `FlareSolverr HTTP ${res.status}` };
      }
      if (data.status !== 'ok' || !data.solution) {
        return {
          ok: false,
          cookies: [],
          error: data.message || data.status || 'FlareSolverr solve failed',
        };
      }

      const cookies: FlareSolverrCookie[] = Array.isArray(data.solution.cookies)
        ? data.solution.cookies.map((c: any) => ({
            name: String(c.name),
            value: String(c.value),
            domain: c.domain,
            path: c.path,
          }))
        : [];

      return {
        ok: true,
        status: data.solution.status,
        cookies,
        userAgent: data.solution.userAgent,
        solutionUrl: data.solution.url,
        responseHtml: typeof data.solution.response === 'string' ? data.solution.response : undefined,
      };
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? 'FlareSolverr timeout' : err?.message || 'FlareSolverr error';
      return { ok: false, cookies: [], error: msg };
    } finally {
      clearTimeout(timeoutId);
    }
  });
}
