import { describe, it, expect } from 'vitest';
import {
  fetchConfigWithSession,
  getHostSession,
  headersForHost,
  hostKeyFromUrl,
} from '@/lib/crawler/cf-sessions';

describe('cf-sessions helpers', () => {
  const config = {
    startUrl: 'https://example.com/',
    bypassCloudflare: true,
    cloudflareSessions: {
      'example.com': {
        cookieHeader: 'cf_clearance=abc; __cf_bm=xyz',
        userAgent: 'Mozilla/5.0 FlareUA',
        solvedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  };

  it('extracts hostname keys', () => {
    expect(hostKeyFromUrl('https://Example.COM/path')).toBe('example.com');
    expect(hostKeyFromUrl('not-a-url')).toBeNull();
  });

  it('reads host sessions from config', () => {
    expect(getHostSession(config, 'https://example.com/page')?.cookieHeader).toBe(
      'cf_clearance=abc; __cf_bm=xyz',
    );
    expect(getHostSession(config, 'https://other.com/')).toBeNull();
    expect(getHostSession({}, 'https://example.com/')).toBeNull();
  });

  it('builds Cookie/UA headers only when a session exists', () => {
    expect(headersForHost(config, 'https://example.com/')).toEqual({
      Cookie: 'cf_clearance=abc; __cf_bm=xyz',
      'User-Agent': 'Mozilla/5.0 FlareUA',
    });
    expect(headersForHost(config, 'https://other.com/')).toEqual({});
  });

  it('applies FlareSolverr UA as customUserAgent when session exists', () => {
    const withUa = fetchConfigWithSession(config, 'https://example.com/');
    expect(withUa.customUserAgent).toBe('Mozilla/5.0 FlareUA');
    expect(fetchConfigWithSession(config, 'https://other.com/')).toBe(config);
  });

  it('allows UA-only sessions when cookies are empty', () => {
    const uaOnly = {
      ...config,
      cloudflareSessions: {
        'example.com': {
          cookieHeader: '',
          userAgent: 'Mozilla/5.0 FlareUA',
          solvedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    };
    expect(getHostSession(uaOnly, 'https://example.com/')?.userAgent).toBe('Mozilla/5.0 FlareUA');
    expect(headersForHost(uaOnly, 'https://example.com/')).toEqual({
      'User-Agent': 'Mozilla/5.0 FlareUA',
    });
  });
});
