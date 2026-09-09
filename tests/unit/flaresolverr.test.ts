import { describe, it, expect, afterEach } from 'vitest';
import { cookiesToHeader, isFlareSolverrConfigured } from '@/lib/crawler/flaresolverr';

describe('flaresolverr helpers', () => {
  const prev = process.env.FLARESOLVERR_URL;

  afterEach(() => {
    if (prev === undefined) delete process.env.FLARESOLVERR_URL;
    else process.env.FLARESOLVERR_URL = prev;
  });

  it('reports configured when FLARESOLVERR_URL is set', () => {
    process.env.FLARESOLVERR_URL = 'http://flaresolverr:8191/v1';
    expect(isFlareSolverrConfigured()).toBe(true);
  });

  it('reports not configured when unset outside development', () => {
    delete process.env.FLARESOLVERR_URL;
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    expect(isFlareSolverrConfigured()).toBe(false);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('defaults to local FlareSolverr in development when unset', () => {
    delete process.env.FLARESOLVERR_URL;
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    expect(isFlareSolverrConfigured()).toBe(true);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('builds a Cookie header from FlareSolverr cookies', () => {
    expect(
      cookiesToHeader([
        { name: 'cf_clearance', value: 'abc' },
        { name: '__cf_bm', value: 'xyz' },
      ]),
    ).toBe('cf_clearance=abc; __cf_bm=xyz');
  });
});
