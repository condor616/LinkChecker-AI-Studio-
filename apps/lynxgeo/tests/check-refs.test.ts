import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHECK_REFS,
  checkRefForFindingId,
  checkRefForKey,
  unmappedCriterionKeys,
} from '../lib/geo/check-refs';
import { CRITERION_CATALOG } from '../lib/geo/score';

test('every criterion in the catalog maps to an official document', () => {
  assert.deepEqual(unmappedCriterionKeys(), []);
  for (const criterion of CRITERION_CATALOG) {
    const ref = checkRefForKey(criterion.key);
    assert.ok(ref, `missing ref for ${criterion.key}`);
  }
});

test('every mapped reference is an https URL with a title and publisher', () => {
  for (const [key, ref] of Object.entries(CHECK_REFS)) {
    assert.ok(ref.href.startsWith('https://'), `${key} must use https, got ${ref.href}`);
    assert.doesNotThrow(() => new URL(ref.href), `${key} href must parse as a URL`);
    assert.ok(ref.title.trim().length > 0, `${key} needs a title`);
    assert.ok(ref.publisher.trim().length > 0, `${key} needs a publisher`);
    assert.ok(
      ['rfc', 'spec', 'convention', 'docs'].includes(ref.kind),
      `${key} has unknown kind ${ref.kind}`,
    );
  }
});

test('raw probe finding ids resolve to the robots specification', () => {
  for (const id of ['robots-missing', 'robots-present']) {
    assert.equal(checkRefForFindingId(id)?.href, 'https://www.rfc-editor.org/rfc/rfc9309.html');
  }
});

test('page finding ids carrying a URL suffix resolve to their criterion', () => {
  const cases: [string, string][] = [
    ['date-https://example.com/blog/post', 'https://html.spec.whatwg.org/'],
    ['canonical-https://example.com/', 'https://html.spec.whatwg.org/multipage/links.html#rel-canonical'],
    ['jsonld-https://example.com/a?b=c', 'https://www.w3.org/TR/json-ld11/'],
    ['md-alt-https://example.com/', 'https://www.rfc-editor.org/rfc/rfc7763.html'],
    ['http-https://example.com/404', 'https://www.rfc-editor.org/rfc/rfc9110.html'],
    ['noindex-https://example.com/x', 'https://developers.google.com/search/docs/crawling-indexing/robots/intro'],
    ['https-https://example.com/x', 'https://www.rfc-editor.org/rfc/rfc9110.html'],
  ];
  for (const [id, href] of cases) {
    assert.equal(checkRefForFindingId(id)?.href, href, `unexpected ref for ${id}`);
  }
});

test('bot criteria point at the robots protocol or Google crawler documentation', () => {
  for (const bot of ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot']) {
    assert.equal(checkRefForKey(`bot-${bot}`)?.href, 'https://www.rfc-editor.org/rfc/rfc9309.html');
  }
  const googleCrawlers = 'https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers';
  assert.equal(checkRefForKey('bot-Googlebot')?.href, googleCrawlers);
  assert.equal(checkRefForKey('train-Google-Extended')?.href, googleCrawlers);
});

test('convention files are labelled convention, not RFC', () => {
  for (const key of ['llms-txt', 'llms-full']) {
    const ref = checkRefForKey(key);
    assert.equal(ref?.href, 'https://llmstxt.org/');
    assert.equal(ref?.kind, 'convention');
  }
  assert.equal(checkRefForKey('mcp-json')?.href, 'https://modelcontextprotocol.io/specification/2025-03-26');
  assert.equal(checkRefForKey('sitemap')?.href, 'https://www.sitemaps.org/protocol.html');
});

test('unknown ids resolve to undefined instead of a wrong document', () => {
  assert.equal(checkRefForFindingId('totally-unknown-check'), undefined);
  assert.equal(checkRefForKey(''), undefined);
});
