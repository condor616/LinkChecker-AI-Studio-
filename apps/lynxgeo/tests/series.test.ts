import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTargetedScanConfig } from '@lynx/crawler-core';
import { AuditStartSchema } from '../lib/validation';
import {
  configsMatchForCompare,
  countRerunsForMain,
  isMainScan,
  isRerun,
  resolveBaselineAuditId,
  resolveSeriesId,
} from '../lib/geo/series';

test('AuditStartSchema preserves targeted crawl settings', () => {
  const parsed = AuditStartSchema.parse({
    startUrl: 'https://example.com/',
    isTargeted: true,
    targetUrls: ['https://example.com/a', 'https://example.com/b'],
  });
  assert.equal(parsed.isTargeted, true);
  assert.deepEqual(parsed.targetUrls, ['https://example.com/a', 'https://example.com/b']);
});

test('AuditStartSchema clears targeted mode without urls', () => {
  const parsed = AuditStartSchema.parse({
    startUrl: 'https://example.com/',
    isTargeted: true,
    targetUrls: [],
  });
  assert.equal(parsed.isTargeted, false);
  assert.equal(parsed.targetUrls, undefined);
});

test('isTargetedScanConfig matches crawler-core expectations', () => {
  assert.equal(
    isTargetedScanConfig({ isTargeted: true, targetUrls: ['https://example.com/a'] }),
    true,
  );
  assert.equal(isTargetedScanConfig({ isTargeted: true, targetUrls: [] }), false);
});

test('configsMatchForCompare detects real config drift', () => {
  const left = { startUrl: 'https://example.com/', maxDepth: 2 };
  const right = { startUrl: 'https://example.com/', maxDepth: 3 };
  assert.equal(configsMatchForCompare(left, right), false);
});

test('series helpers use stored ids when present', () => {
  const audit = { id: 'run-2', seriesId: 'series-1', baselineAuditId: 'run-1' };
  assert.equal(resolveSeriesId(audit), 'series-1');
  assert.equal(resolveBaselineAuditId(audit), 'run-1');
});

test('isMainScan and isRerun distinguish discovery from follow-ups', () => {
  const discovery = { id: 'run-1', baselineAuditId: null };
  const discoverySelf = { id: 'run-1', baselineAuditId: 'run-1' };
  const rerun = { id: 'run-2', baselineAuditId: 'run-1' };

  assert.equal(isMainScan(discovery), true);
  assert.equal(isMainScan(discoverySelf), true);
  assert.equal(isMainScan(rerun), false);

  assert.equal(isRerun(discovery), false);
  assert.equal(isRerun(rerun), true);
});

test('countRerunsForMain counts only follow-ups pinned to a discovery run', () => {
  const all = [
    { id: 'run-1', baselineAuditId: null },
    { id: 'run-2', baselineAuditId: 'run-1' },
    { id: 'run-3', baselineAuditId: 'run-1' },
    { id: 'other-1', baselineAuditId: null },
    { id: 'other-2', baselineAuditId: 'other-1' },
  ];
  assert.equal(countRerunsForMain(all, 'run-1'), 2);
  assert.equal(countRerunsForMain(all, 'other-1'), 1);
  assert.equal(countRerunsForMain(all, 'run-2'), 0);
});
