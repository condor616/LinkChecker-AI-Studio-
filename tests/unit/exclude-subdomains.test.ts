// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getSkipReason, getTraversalSkipReason } from '@lynx/crawler-core';

describe('excludeSubdomains', () => {
  const config = {
    startUrl: 'https://roche.com',
    excludeSubdomains: true,
    skipExternal: true,
  };

  it('skips subdomain URLs at discovery (no fetch)', () => {
    const url =
      'https://api-prod.roche.com/forms/v1/processing-requests?roche-dropdown-location-region=dy';
    expect(getSkipReason(url, config)).toBe('Subdomain excluded');
  });

  it('does not skip the apex host or www equivalent', () => {
    expect(getSkipReason('https://roche.com/about', config)).toBeNull();
    expect(getSkipReason('https://www.roche.com/about', config)).toBeNull();
  });

  it('does not treat true external hosts as subdomain exclusions', () => {
    expect(getSkipReason('https://google.com', config)).toBeNull();
  });

  it('still reports subdomain traversal skip as a safety net', () => {
    expect(
      getTraversalSkipReason('https://blog.roche.com/post', config, 'SUCCESS'),
    ).toBe('Subdomain excluded (Verified)');
  });

  it('does nothing when excludeSubdomains is off', () => {
    const open = { ...config, excludeSubdomains: false };
    expect(getSkipReason('https://api-prod.roche.com/x', open)).toBeNull();
  });
});
