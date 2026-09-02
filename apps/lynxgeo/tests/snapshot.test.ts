import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCORE_MODEL_VERSION } from '../lib/geo/score';
import { configsMatchForCompare, resolveBaselineAuditId, resolveSeriesId, runLabelForIndex } from '../lib/geo/series';
import { diffSnapshots, freezeSnapshot, pinnedTargetUrls } from '../lib/geo/snapshot';

const baseCategories = {
  crawlAccess: 70,
  extractability: 70,
  negotiation: 70,
  discovery: 70,
  citeability: 70,
};

test('freezeSnapshot stores the current score model version', () => {
  const snap = freezeSnapshot({
    score: 81,
    categories: { crawlAccess: 80, extractability: 80, negotiation: 80, discovery: 80, citeability: 90 },
    findings: [],
    playbook: [],
    pages: [],
  });
  assert.equal(snap.scoreModelVersion, SCORE_MODEL_VERSION);
  assert.equal(snap.score, 81);
});

test('diffSnapshots flags rubric changes and issue movement', () => {
  const from = freezeSnapshot({
    score: 70,
    categories: baseCategories,
    findings: [
      { id: 'old', category: 'crawlAccess', title: 'robots', detail: '', severity: 'fail', standard: 'established', suggestion: '' },
    ],
    playbook: [],
    pages: [{ url: 'https://example.com/', status: 'SUCCESS', statusCode: 200 }],
  });
  const to = {
    ...from,
    score: 90,
    scoreModelVersion: 'geo-2.0',
    findings: [
      { id: 'new', category: 'discovery', title: 'llms', detail: '', severity: 'warn', standard: 'convention', suggestion: '' },
    ],
  };
  const diff = diffSnapshots(from, to);
  assert.equal(diff.rubricChanged, true);
  assert.equal(diff.comparable, false);
  assert.equal(diff.scoreDelta, 20);
  assert.equal(diff.resolved[0].id, 'old');
  assert.equal(diff.newIssues[0].id, 'new');
});

test('geo-1.0 vs geo-1.0.1 is a rubric change', () => {
  const from = freezeSnapshot({
    score: 70,
    categories: baseCategories,
    findings: [],
    playbook: [],
    pages: [{ url: 'https://example.com/', status: 'SUCCESS', statusCode: 200 }],
  });
  const to = { ...from, scoreModelVersion: 'geo-1.0' };
  const diff = diffSnapshots(to, from);
  assert.equal(from.scoreModelVersion, SCORE_MODEL_VERSION);
  assert.notEqual(SCORE_MODEL_VERSION, 'geo-1.0');
  assert.equal(diff.rubricChanged, true);
});

test('diffSnapshots aligns page-level findings by criterion and url', () => {
  const url = 'https://example.com/page';
  const from = freezeSnapshot({
    score: 70,
    categories: baseCategories,
    findings: [
      {
        id: `noindex-${url}`,
        category: 'crawlAccess',
        title: 'noindex',
        detail: '',
        severity: 'fail',
        standard: 'established',
        suggestion: '',
        url,
      },
    ],
    playbook: [],
    pages: [{ url, status: 'SUCCESS', statusCode: 200 }],
  });
  const to = freezeSnapshot({
    score: 85,
    categories: { ...baseCategories, crawlAccess: 85 },
    findings: [
      {
        id: `noindex-${url}`,
        category: 'crawlAccess',
        title: 'noindex',
        detail: '',
        severity: 'pass',
        standard: 'established',
        suggestion: '',
        url,
      },
    ],
    playbook: [],
    pages: [{ url, status: 'SUCCESS', statusCode: 200 }],
  });
  const diff = diffSnapshots(from, to);
  assert.equal(diff.comparable, true);
  assert.equal(diff.resolved.length, 1);
  assert.equal(diff.newIssues.length, 0);
  assert.equal(diff.pageOverlap.shared, 1);
});

test('diffSnapshots reports page overlap when sets differ', () => {
  const from = freezeSnapshot({
    score: 70,
    categories: baseCategories,
    findings: [],
    playbook: [],
    pages: [
      { url: 'https://example.com/a', status: 'SUCCESS', statusCode: 200 },
      { url: 'https://example.com/b', status: 'SUCCESS', statusCode: 200 },
    ],
  });
  const to = freezeSnapshot({
    score: 75,
    categories: baseCategories,
    findings: [],
    playbook: [],
    pages: [
      { url: 'https://example.com/a', status: 'SUCCESS', statusCode: 200 },
      { url: 'https://example.com/c', status: 'SUCCESS', statusCode: 200 },
    ],
  });
  const diff = diffSnapshots(from, to);
  assert.equal(diff.pageOverlap.shared, 1);
  assert.equal(diff.pageOverlap.onlyInFrom, 1);
  assert.equal(diff.pageOverlap.onlyInTo, 1);
  assert.equal(diff.comparable, false);
});

test('diffSnapshots reports page status changes on shared pages', () => {
  const from = freezeSnapshot({
    score: 70,
    categories: baseCategories,
    findings: [],
    playbook: [],
    pages: [
      { url: 'https://example.com/ok', status: 'SUCCESS', statusCode: 200 },
      { url: 'https://example.com/broken', status: 'SUCCESS', statusCode: 200 },
    ],
  });
  const to = freezeSnapshot({
    score: 65,
    categories: baseCategories,
    findings: [],
    playbook: [],
    pages: [
      { url: 'https://example.com/ok', status: 'SUCCESS', statusCode: 200 },
      { url: 'https://example.com/broken', status: 'BROKEN', statusCode: 404 },
    ],
  });
  const diff = diffSnapshots(from, to);
  assert.equal(diff.pageStatusChanges.length, 1);
  assert.equal(diff.pageStatusChanges[0].url, 'https://example.com/broken');
  assert.equal(diff.pageStatusChanges[0].fromStatus, 'SUCCESS');
  assert.equal(diff.pageStatusChanges[0].toStatus, 'BROKEN');
  assert.equal(diff.pageStatusChanges[0].toStatusCode, 404);
});

test('diffSnapshots reports issue summary and severity counts', () => {
  const url = 'https://example.com/page';
  const from = freezeSnapshot({
    score: 70,
    categories: baseCategories,
    findings: [
      {
        id: 'a',
        category: 'crawlAccess',
        title: 'robots',
        detail: 'blocked',
        severity: 'fail',
        standard: 'established',
        suggestion: 'fix robots',
        url,
      },
      {
        id: 'b',
        category: 'discovery',
        title: 'llms',
        detail: '',
        severity: 'warn',
        standard: 'convention',
        suggestion: '',
      },
      {
        id: 'c',
        category: 'citeability',
        title: 'date',
        detail: '',
        severity: 'warn',
        standard: 'convention',
        suggestion: '',
        url,
      },
    ],
    playbook: [],
    pages: [{ url, status: 'SUCCESS', statusCode: 200 }],
  });
  const to = freezeSnapshot({
    score: 80,
    categories: baseCategories,
    findings: [
      {
        id: 'c',
        category: 'citeability',
        title: 'date',
        detail: '',
        severity: 'fail',
        standard: 'convention',
        suggestion: 'add date',
        url,
      },
      {
        id: 'd',
        category: 'negotiation',
        title: 'new issue',
        detail: '',
        severity: 'warn',
        standard: 'convention',
        suggestion: '',
      },
    ],
    playbook: [],
    pages: [{ url, status: 'SUCCESS', statusCode: 200 }],
  });
  const diff = diffSnapshots(from, to);
  assert.equal(diff.issueSummary.fromTotal, 3);
  assert.equal(diff.issueSummary.toTotal, 2);
  assert.equal(diff.issueSummary.resolved, 2);
  assert.equal(diff.issueSummary.new, 1);
  assert.equal(diff.issueSummary.changed, 1);
  assert.equal(diff.issueSummary.unchanged, 0);
  assert.equal(diff.severityFrom.fail, 1);
  assert.equal(diff.severityFrom.warn, 2);
  assert.equal(diff.severityTo.fail, 1);
  assert.equal(diff.severityTo.warn, 1);
});

test('diffSnapshots counts unchanged issues', () => {
  const url = 'https://example.com/page';
  const finding = {
    id: 'stable',
    category: 'crawlAccess' as const,
    title: 'canonical',
    detail: 'missing',
    severity: 'warn' as const,
    standard: 'established' as const,
    suggestion: 'add canonical',
    url,
  };
  const from = freezeSnapshot({
    score: 70,
    categories: baseCategories,
    findings: [finding],
    playbook: [],
    pages: [{ url, status: 'SUCCESS', statusCode: 200 }],
  });
  const to = freezeSnapshot({
    score: 70,
    categories: baseCategories,
    findings: [{ ...finding }],
    playbook: [],
    pages: [{ url, status: 'SUCCESS', statusCode: 200 }],
  });
  const diff = diffSnapshots(from, to);
  assert.equal(diff.issueSummary.unchanged, 1);
  assert.equal(diff.issueSummary.resolved, 0);
  assert.equal(diff.issueSummary.new, 0);
  assert.equal(diff.issueSummary.changed, 0);
});

test('diffSnapshots detects severity changes', () => {
  const url = 'https://example.com/page';
  const from = freezeSnapshot({
    score: 70,
    categories: baseCategories,
    findings: [
      {
        id: `date-${url}`,
        category: 'citeability',
        title: 'date',
        detail: '',
        severity: 'warn',
        standard: 'convention',
        suggestion: '',
        url,
      },
    ],
    playbook: [],
    pages: [{ url, status: 'SUCCESS', statusCode: 200 }],
  });
  const to = freezeSnapshot({
    score: 65,
    categories: baseCategories,
    findings: [
      {
        id: `date-${url}`,
        category: 'citeability',
        title: 'date',
        detail: '',
        severity: 'fail',
        standard: 'convention',
        suggestion: '',
        url,
      },
    ],
    playbook: [],
    pages: [{ url, status: 'SUCCESS', statusCode: 200 }],
  });
  const diff = diffSnapshots(from, to);
  assert.equal(diff.changed.length, 1);
  assert.equal(diff.changed[0].from.severity, 'warn');
  assert.equal(diff.changed[0].to.severity, 'fail');
});

test('pinnedTargetUrls normalizes snapshot page urls', () => {
  const snap = freezeSnapshot({
    score: 80,
    categories: baseCategories,
    findings: [],
    playbook: [],
    pages: [
      { url: 'https://example.com/a#section', status: 'SUCCESS', statusCode: 200 },
      { url: 'https://example.com/b', status: 'SUCCESS', statusCode: 200 },
    ],
  });
  const urls = pinnedTargetUrls(snap);
  assert.deepEqual(urls, ['https://example.com/a', 'https://example.com/b']);
});

test('configsMatchForCompare ignores targeted rerun fields', () => {
  const base = { startUrl: 'https://example.com/', maxDepth: 2, rateLimit: 60 };
  const discovery = { ...base, isTargeted: false };
  const rerun = { ...base, isTargeted: true, targetUrls: ['https://example.com/a'] };
  assert.equal(configsMatchForCompare(discovery, rerun), true);
});

test('resolveSeriesId and resolveBaselineAuditId fall back to audit id', () => {
  const audit = { id: 'audit-1', seriesId: null, baselineAuditId: null };
  assert.equal(resolveSeriesId(audit), 'audit-1');
  assert.equal(resolveBaselineAuditId(audit), 'audit-1');
});

test('runLabelForIndex labels discovery and reruns', () => {
  const main = { id: 'main', baselineAuditId: 'main' };
  const rerun = { id: 'rerun-1', baselineAuditId: 'main' };
  assert.equal(runLabelForIndex(main, 0), 'Discovery');
  assert.equal(runLabelForIndex(rerun, 1), 'Re-run 1');
  assert.equal(runLabelForIndex(rerun, 2), 'Re-run 2');
});
