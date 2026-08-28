import { describe, it, expect } from 'vitest';
import { canonicalizeScanUrl, getFetchUrl, getUrlWithoutHash, isTargetUrlMatch, isTargetedScanConfig, parseScanConfig } from '@/lib/utils/url';

describe('canonicalizeScanUrl', () => {
  it('strips trailing slashes and default ports, keeps hash and query', () => {
    expect(canonicalizeScanUrl('https://Example.com:443/path/')).toBe('https://example.com/path');
    expect(canonicalizeScanUrl('https://example.com/path?q=1#tab')).toBe('https://example.com/path?q=1#tab');
  });

  it('keeps content-significant query params as distinct URLs', () => {
    expect(canonicalizeScanUrl('https://example.com/events?event_end_date=2&page=2'))
      .toBe('https://example.com/events?event_end_date=2&page=2');
    expect(canonicalizeScanUrl('https://example.com/catalog?color=blue&page=3'))
      .toBe('https://example.com/catalog?color=blue&page=3');
    expect(canonicalizeScanUrl('https://example.com/events'))
      .not.toBe(canonicalizeScanUrl('https://example.com/events?event_end_date=2'));
  });

  it('strips tracking params so they do not create extra crawl targets', () => {
    expect(canonicalizeScanUrl('https://example.com/page?utm_source=news&utm_campaign=x&page=2'))
      .toBe('https://example.com/page?page=2');
    expect(canonicalizeScanUrl('https://example.com/page?fbclid=abc&gclid=def'))
      .toBe('https://example.com/page');
    expect(canonicalizeScanUrl('https://example.com/page?utm_source=a'))
      .toBe(canonicalizeScanUrl('https://example.com/page'));
  });
});

describe('getUrlWithoutHash', () => {
  it('removes the fragment and re-canonicalizes', () => {
    expect(getUrlWithoutHash('https://example.com/page/#tab-1')).toBe('https://example.com/page');
    expect(getUrlWithoutHash('https://example.com/page')).toBe('https://example.com/page');
  });
});

describe('getFetchUrl', () => {
  it('strips the hash but keeps a trailing slash', () => {
    expect(getFetchUrl('https://example.com/it-it/#tab')).toBe('https://example.com/it-it/');
  });
});

describe('isTargetUrlMatch', () => {
  it('matches an exact PDF target', () => {
    const pdf = 'https://www.novartis.com/sites/novartis_com/files/report.pdf';
    expect(isTargetUrlMatch(pdf, pdf)).toBe(true);
  });

  it('ignores www vs non-www differences', () => {
    expect(isTargetUrlMatch(
      'https://novartis.com/files/report.pdf',
      'https://www.novartis.com/files/report.pdf',
    )).toBe(true);
  });

  it('matches query and hash variants when the target has neither', () => {
    const target = 'https://example.com/page';
    expect(isTargetUrlMatch('https://example.com/page#tabq3-2025-17051', target)).toBe(true);
    expect(isTargetUrlMatch('https://example.com/page?utm=1', target)).toBe(true);
  });

  it('requires an exact match when the target includes a fragment', () => {
    const target = 'https://example.com/page#tabq3-2025-17051';
    expect(isTargetUrlMatch(target, target)).toBe(true);
    expect(isTargetUrlMatch('https://example.com/page', target)).toBe(false);
    expect(isTargetUrlMatch('https://example.com/page#tabannual', target)).toBe(false);
    expect(isTargetUrlMatch('https://example.com/files/report.pdf', target)).toBe(false);
  });

  it('does not treat a longer path as a match', () => {
    expect(isTargetUrlMatch('https://example.com/foobar', 'https://example.com/foo')).toBe(false);
  });
});

describe('isTargetedScanConfig', () => {
  it('is true only when isTargeted and at least one target URL', () => {
    expect(isTargetedScanConfig({ isTargeted: true, targetUrls: ['https://example.com/a'] })).toBe(true);
    expect(isTargetedScanConfig(JSON.stringify({ isTargeted: true, targetUrls: ['https://example.com/a'] }))).toBe(true);
  });

  it('is false for normal scans and incomplete targeting config', () => {
    expect(isTargetedScanConfig({ isTargeted: false, targetUrls: ['https://example.com/a'] })).toBe(false);
    expect(isTargetedScanConfig({ isTargeted: true, targetUrls: [] })).toBe(false);
    expect(isTargetedScanConfig({ isTargeted: true })).toBe(false);
    expect(isTargetedScanConfig({})).toBe(false);
    expect(isTargetedScanConfig('not-json')).toBe(false);
    expect(isTargetedScanConfig(null)).toBe(false);
  });

  it('hides visual dashboard for targeted scans (same rule as the scan header)', () => {
    const shouldShowVisualDashboard = (config: unknown) => !isTargetedScanConfig(config);
    expect(shouldShowVisualDashboard({ isTargeted: true, targetUrls: ['https://example.com/pdf'] })).toBe(false);
    expect(shouldShowVisualDashboard({ isTargeted: false, startUrl: 'https://example.com' })).toBe(true);
  });
});

describe('parseScanConfig', () => {
  it('parses JSON strings and passes objects through', () => {
    expect(parseScanConfig('{"isTargeted":true}')).toEqual({ isTargeted: true });
    expect(parseScanConfig({ startUrl: 'https://example.com' })).toEqual({ startUrl: 'https://example.com' });
    expect(parseScanConfig('')).toEqual({});
  });
});
