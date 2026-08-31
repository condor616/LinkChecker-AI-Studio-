import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  auditProgressPercent,
  buildAuditProgress,
  formatAuditProgressMessage,
  isUnlimitedPages,
  parseAuditProgress,
  resolveAuditMaxPages,
} from '../lib/geo/progress';
import { AuditStartSchema } from '../lib/validation';

test('0 / empty / omitted maxPages is unlimited', () => {
  assert.equal(resolveAuditMaxPages(0), 0);
  assert.equal(resolveAuditMaxPages(''), 0);
  assert.equal(resolveAuditMaxPages(undefined), 0);
  assert.equal(resolveAuditMaxPages(null), 0);
  assert.equal(isUnlimitedPages(0), true);
  assert.equal(resolveAuditMaxPages(80), 80);
  assert.equal(isUnlimitedPages(80), false);
});

test('unlimited crawl status text uses page count, not a fake cap', () => {
  const msg = formatAuditProgressMessage({
    phase: 'crawl',
    pagesFetched: 12,
    maxPages: 0,
    currentUrl: 'https://example.com/care',
  });
  assert.equal(msg, 'Crawling 12 pages · https://example.com/care');
});

test('finite cap still shows fetched / max', () => {
  const msg = formatAuditProgressMessage({
    phase: 'crawl',
    pagesFetched: 12,
    maxPages: 80,
    currentUrl: 'https://example.com/care',
  });
  assert.equal(msg, 'Crawling 12 / 80 · https://example.com/care');
});

test('phase messages cover robots, sitemap, scoring, snapshot, done', () => {
  assert.equal(
    formatAuditProgressMessage({
      phase: 'robots.txt',
      pagesFetched: 0,
      maxPages: 0,
      currentUrl: 'https://example.com/robots.txt',
    }),
    'Checking robots.txt · https://example.com/robots.txt',
  );
  assert.equal(
    formatAuditProgressMessage({
      phase: 'sitemap',
      pagesFetched: 0,
      maxPages: 0,
      currentUrl: 'https://example.com/sitemap.xml',
    }),
    'Checking sitemap · https://example.com/sitemap.xml',
  );
  assert.equal(
    formatAuditProgressMessage({ phase: 'scoring', pagesFetched: 12, maxPages: 0 }),
    'Scoring 12 pages',
  );
  assert.equal(
    formatAuditProgressMessage({ phase: 'snapshot', pagesFetched: 12, maxPages: 0 }),
    'Saving snapshot · 12 pages',
  );
  assert.equal(
    formatAuditProgressMessage({ phase: 'done', pagesFetched: 12, maxPages: 0 }),
    'Crawled 12 pages',
  );
  assert.equal(
    formatAuditProgressMessage({ phase: 'done', pagesFetched: 12, maxPages: 80 }),
    'Crawled 12 / 80',
  );
});

test('parseAuditProgress keeps 0 as unlimited, not 80', () => {
  const stored = buildAuditProgress({
    phase: 'crawl',
    pagesFetched: 3,
    maxPages: 0,
    currentUrl: 'https://example.com/',
  });
  const parsed = parseAuditProgress(JSON.stringify(stored));
  assert.ok(parsed);
  assert.equal(parsed?.pagesFetched, 3);
  assert.equal(parsed?.maxPages, 0);
  assert.equal(parsed?.message, 'Crawling 3 pages · https://example.com/');
});

test('percent is determinate with a cap and uses queue remaining when unlimited', () => {
  const crawling = buildAuditProgress({ phase: 'crawl', pagesFetched: 12, maxPages: 80 });
  assert.equal(auditProgressPercent(crawling, 'RUNNING'), 15);
  assert.equal(auditProgressPercent(crawling, 'COMPLETED'), 100);
  const done = buildAuditProgress({ phase: 'done', pagesFetched: 12, maxPages: 0 });
  assert.equal(auditProgressPercent(done, 'RUNNING'), 100);

  const unlimitedNoQueue = buildAuditProgress({ phase: 'crawl', pagesFetched: 12, maxPages: 0 });
  assert.equal(auditProgressPercent(unlimitedNoQueue, 'RUNNING'), null);

  const unlimitedKnown = buildAuditProgress({
    phase: 'crawl',
    pagesFetched: 12,
    maxPages: 0,
    queuedRemaining: 36,
  });
  assert.equal(auditProgressPercent(unlimitedKnown, 'RUNNING'), 25);
});

test('AuditStartSchema defaults maxPages to unlimited and accepts a finite cap', () => {
  const unlimited = AuditStartSchema.parse({ startUrl: 'https://www.novartis.com/us-en/' });
  assert.equal(unlimited.maxPages, 0);
  const capped = AuditStartSchema.parse({ startUrl: 'https://www.novartis.com/us-en/', maxPages: 80 });
  assert.equal(capped.maxPages, 80);
  const empty = AuditStartSchema.parse({ startUrl: 'https://www.novartis.com/us-en/', maxPages: 0 });
  assert.equal(empty.maxPages, 0);
});
