import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildFrontier,
  canTransitionAuditStatus,
  emptyFrontier,
  parseFrontier,
  serializeFrontier,
} from '../lib/geo/frontier';
import { nextGeoAuditJobId } from '../lib/geo/frontier';

test('empty frontier starts at the start URL with probes pending', () => {
  const frontier = emptyFrontier('https://www.novartis.com/us-en/');
  assert.equal(frontier.probesDone, false);
  assert.equal(frontier.phase, 'probes');
  assert.equal(frontier.queue[0]?.url, 'https://www.novartis.com/us-en/');
  assert.deepEqual(frontier.seen, []);
});

test('round-trips remaining queue, seen URLs, and probe findings', () => {
  const frontier = buildFrontier({
    probesDone: true,
    phase: 'crawl',
    pagesFetched: 2,
    seen: ['https://www.novartis.com/us-en/', 'https://www.novartis.com/us-en/about'],
    queue: [{ url: 'https://www.novartis.com/us-en/news', depth: 1, parentUrl: 'https://www.novartis.com/us-en/' }],
    probeFindings: [
      {
        id: 'robots-present',
        category: 'crawlAccess',
        title: 'robots.txt is reachable',
        detail: 'ok',
        severity: 'pass',
        standard: 'established',
        suggestion: '',
        url: 'https://www.novartis.com/robots.txt',
      },
    ],
  });
  const parsed = parseFrontier(serializeFrontier(frontier));
  assert.ok(parsed);
  assert.equal(parsed?.probesDone, true);
  assert.equal(parsed?.pagesFetched, 2);
  assert.equal(parsed?.queue[0]?.url, 'https://www.novartis.com/us-en/news');
  assert.equal(parsed?.queue[0]?.depth, 1);
  assert.ok(parsed?.seen.includes('https://www.novartis.com/us-en/about'));
  assert.equal(parsed?.probeFindings[0]?.id, 'robots-present');
});

test('parseFrontier rejects missing queue', () => {
  assert.equal(parseFrontier('{"probesDone":true}'), null);
  assert.equal(parseFrontier(''), null);
  assert.equal(parseFrontier(null), null);
});

test('status transitions: pause, resume, cancel', () => {
  assert.equal(canTransitionAuditStatus('RUNNING', 'PAUSED'), true);
  assert.equal(canTransitionAuditStatus('PAUSED', 'RUNNING'), true);
  assert.equal(canTransitionAuditStatus('RUNNING', 'CANCELLED'), true);
  assert.equal(canTransitionAuditStatus('PAUSED', 'CANCELLED'), true);
  assert.equal(canTransitionAuditStatus('COMPLETED', 'PAUSED'), false);
  assert.equal(canTransitionAuditStatus('CANCELLED', 'RUNNING'), false);
  assert.equal(canTransitionAuditStatus('FAILED', 'RUNNING'), false);
  assert.equal(canTransitionAuditStatus('RUNNING', 'COMPLETED'), false);
});

test('resume job ids are unique and not the fixed geo-audit-<id> key', () => {
  const id = '752022db-1faf-4b3e-a3c0-6efaea93bdce';
  const a = nextGeoAuditJobId(id);
  const b = nextGeoAuditJobId(id);
  assert.notEqual(a, b);
  assert.notEqual(a, `geo-audit-${id}`);
  assert.match(a, new RegExp(`^geo-audit-${id}-`));
});
