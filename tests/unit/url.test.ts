import { describe, it, expect } from 'vitest';
import { canonicalizeScanUrl, getFetchUrl, getUrlWithoutHash, isTargetUrlMatch } from '@/lib/utils/url';

describe('canonicalizeScanUrl', () => {
  it('strips trailing slashes and default ports, keeps hash and query', () => {
    expect(canonicalizeScanUrl('https://Example.com:443/path/')).toBe('https://example.com/path');
    expect(canonicalizeScanUrl('https://example.com/path?q=1#tab')).toBe('https://example.com/path?q=1#tab');
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
