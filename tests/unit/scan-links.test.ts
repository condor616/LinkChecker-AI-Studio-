import { describe, it, expect } from 'vitest';
import {
  filterTriageLinks,
  groupLinks,
  groupLinksBySource,
  buildTriageGroups,
} from '@/lib/utils/scan-links';

const regularConfig = {
  startUrl: 'https://example.com',
  excludeSubdomains: false,
};

const targetedConfig = {
  startUrl: 'https://example.com',
  isTargeted: true,
  targetUrls: ['https://example.com/target'],
};

describe('filterTriageLinks', () => {
  it('keeps entry points and links found on internal pages', () => {
    const links = [
      { url: 'https://example.com', parentUrl: null, status: 'SUCCESS' },
      { url: 'https://example.com/a', parentUrl: 'https://example.com', status: 'SUCCESS' },
      { url: 'https://cdn.other.com/x', parentUrl: 'https://cdn.other.com', status: 'BROKEN' },
    ];
    expect(filterTriageLinks(links, regularConfig).map((l) => l.url)).toEqual([
      'https://example.com',
      'https://example.com/a',
    ]);
  });

  it('includes skipped links whose parent is internal', () => {
    const links = [
      { url: 'https://example.com/skip.pdf', parentUrl: 'https://example.com', status: 'SKIPPED' },
      { url: 'https://other.com/skip.pdf', parentUrl: 'https://other.com', status: 'SKIPPED' },
    ];
    expect(filterTriageLinks(links, regularConfig).map((l) => l.url)).toEqual([
      'https://example.com/skip.pdf',
    ]);
  });

  it('includes broken links found on a target page even if they are not targets', () => {
    const links = [
      { url: 'https://example.com/target', parentUrl: null, status: 'SUCCESS' },
      { url: 'https://cdn.other.com/missing', parentUrl: 'https://example.com/target', status: 'BROKEN' },
      { url: 'https://example.com/other', parentUrl: 'https://example.com', status: 'SUCCESS' },
    ];
    expect(filterTriageLinks(links, targetedConfig).map((l) => l.url)).toEqual([
      'https://example.com/target',
      'https://cdn.other.com/missing',
    ]);
  });
});

describe('groupLinks', () => {
  it('groups http/https variants under one key (first instance supplies the display URL)', () => {
    const links = [
      { url: 'http://example.com/a', parentUrl: 'https://example.com', status: 'BROKEN' },
      { url: 'https://example.com/a', parentUrl: 'https://example.com/p', status: 'BROKEN' },
    ];
    const groups = groupLinks(links);
    expect(groups).toHaveLength(1);
    expect(groups[0].url).toBe('http://example.com/a');
    expect(groups[0].count).toBe(2);
    expect(groups[0].normalizedKey).toBe('example.com/a');
    expect(groups[0].instances).toHaveLength(2);
  });
});

describe('groupLinksBySource', () => {
  it('groups by parent URL and marks the group broken if any instance is broken', () => {
    const links = [
      { url: 'https://example.com/a', parentUrl: 'https://example.com', status: 'BROKEN' },
      { url: 'https://example.com/b', parentUrl: 'https://example.com', status: 'SUCCESS' },
    ];
    const groups = groupLinksBySource(links);
    expect(groups).toHaveLength(1);
    expect(groups[0].url).toBe('https://example.com');
    expect(groups[0].status).toBe('BROKEN');
    expect(groups[0].count).toBe(2);
  });
});

describe('buildTriageGroups', () => {
  it('splits rechecked links out of success/skipped buckets', () => {
    const links = [
      { url: 'https://example.com/ok', parentUrl: null, status: 'SUCCESS', isRechecked: false },
      { url: 'https://example.com/fixed', parentUrl: null, status: 'SUCCESS', isRechecked: true },
    ];
    const groups = buildTriageGroups(links, regularConfig, 'url');
    expect(groups.successLinks).toHaveLength(1);
    expect(groups.recheckedLinks).toHaveLength(1);
  });
});
