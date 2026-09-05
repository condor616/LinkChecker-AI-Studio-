import { describe, it, expect } from 'vitest';
import { filterScansByQuery, getScanStartUrl, scanMatchesQuery } from '@/lib/utils/scan-history';

const scans = [
  { id: '1', name: 'Weekly Health Check', config: JSON.stringify({ startUrl: 'https://example.com/docs' }) },
  { id: '2', name: 'Marketing site', config: JSON.stringify({ startUrl: 'https://acme.dev' }) },
  { id: '3', name: 'Broken JSON', config: '{not-json' },
];

describe('getScanStartUrl', () => {
  it('reads startUrl from scan config JSON', () => {
    expect(getScanStartUrl(scans[0].config)).toBe('https://example.com/docs');
  });

  it('returns empty string for invalid config', () => {
    expect(getScanStartUrl('{not-json')).toBe('');
    expect(getScanStartUrl(null)).toBe('');
  });
});

describe('scanMatchesQuery', () => {
  it('matches case-insensitively on name and start URL', () => {
    expect(scanMatchesQuery(scans[0], 'health')).toBe(true);
    expect(scanMatchesQuery(scans[0], 'EXAMPLE.COM')).toBe(true);
    expect(scanMatchesQuery(scans[0], 'acme')).toBe(false);
  });

  it('treats blank query as a match-all', () => {
    expect(scanMatchesQuery(scans[0], '   ')).toBe(true);
  });
});

describe('filterScansByQuery', () => {
  it('filters the list by name or URL fragment', () => {
    expect(filterScansByQuery(scans, 'acme').map((s) => s.id)).toEqual(['2']);
    expect(filterScansByQuery(scans, 'docs').map((s) => s.id)).toEqual(['1']);
    expect(filterScansByQuery(scans, '').map((s) => s.id)).toEqual(['1', '2', '3']);
  });
});
