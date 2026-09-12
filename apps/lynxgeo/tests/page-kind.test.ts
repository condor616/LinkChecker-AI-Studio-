import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isArticleLike,
  isOgArticle,
  jsonLdDateSignals,
  jsonLdHasArticleType,
} from '../lib/geo/page-kind';
import { parseJsonLdDocument } from '../lib/geo/schemaorg/parse-jsonld';

test('isOgArticle accepts article only', () => {
  assert.equal(isOgArticle('article'), true);
  assert.equal(isOgArticle('Article'), true);
  assert.equal(isOgArticle(' website '), false);
  assert.equal(isOgArticle(null), false);
  assert.equal(isOgArticle(undefined), false);
});

test('isArticleLike: og-only, JSON-LD-only, neither, website', () => {
  assert.equal(isArticleLike({ ogType: 'article' }), true);
  assert.equal(isArticleLike({ ogType: 'website' }), false);
  assert.equal(isArticleLike({}), false);

  const blog = parseJsonLdDocument(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: 'Hi',
    }),
  );
  assert.equal(isArticleLike({ jsonLdBlocks: [blog] }), true);
  assert.equal(isArticleLike({ ogType: 'website', jsonLdBlocks: [blog] }), true);

  const org = parseJsonLdDocument(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Acme',
    }),
  );
  assert.equal(jsonLdHasArticleType([org]), false);
  assert.equal(isArticleLike({ ogType: 'website', jsonLdBlocks: [org] }), false);
});

test('jsonLdDateSignals collects datePublished and dateModified', () => {
  const block = parseJsonLdDocument(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      datePublished: '2026-01-02',
      dateModified: '2026-02-03',
    }),
  );
  const signals = jsonLdDateSignals([block]);
  assert.deepEqual(signals, [
    'JSON-LD datePublished="2026-01-02"',
    'JSON-LD dateModified="2026-02-03"',
  ]);
});
