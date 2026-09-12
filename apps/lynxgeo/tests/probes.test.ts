import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AI_SEARCH_BOTS,
  TRAINING_BOTS,
  hasTdmRepSignal,
  isParseableHttpDate,
  llmsTxtStructureIssues,
  looksLikeSitemap,
  parseRobotsSitemapUrls,
  parseSitemapLastmod,
  sitemapLastmodCoverageOk,
} from '../lib/geo/probes';

test('AI search and training bot lists include 2026 crawlers', () => {
  for (const bot of ['Bingbot', 'Meta-ExternalAgent', 'Amazonbot', 'YouBot']) {
    assert.ok(AI_SEARCH_BOTS.includes(bot), `missing AI search bot ${bot}`);
  }
  for (const bot of ['Applebot-Extended', 'Diffbot']) {
    assert.ok(TRAINING_BOTS.includes(bot), `missing training bot ${bot}`);
  }
  assert.ok(AI_SEARCH_BOTS.includes('GPTBot'));
  assert.ok(TRAINING_BOTS.includes('Google-Extended'));
});

test('bot finding ids follow bot-* and train-* patterns for every listed crawler', () => {
  for (const bot of AI_SEARCH_BOTS) {
    assert.match(`bot-${bot}`, /^bot-/);
  }
  for (const bot of TRAINING_BOTS) {
    assert.match(`train-${bot}`, /^train-/);
  }
});

test('llms.txt structure accepts H1 plus a linked ## section', () => {
  const body = `# Site

> Summary

## Docs

- [Overview](https://example.com/docs)
`;
  assert.deepEqual(llmsTxtStructureIssues(body), []);
});

test('llms.txt structure reports missing H1', () => {
  const body = `## Docs

- [Overview](https://example.com/docs)
`;
  assert.deepEqual(llmsTxtStructureIssues(body), ['missing H1 (# title)']);
});

test('llms.txt structure reports missing linked ## section', () => {
  const body = `# Site

## Docs

No links here.
`;
  assert.deepEqual(llmsTxtStructureIssues(body), ['missing ## section with a markdown link']);
});

test('llms.txt structure reports both gaps when empty', () => {
  assert.deepEqual(llmsTxtStructureIssues(''), [
    'missing H1 (# title)',
    'missing ## section with a markdown link',
  ]);
});

test('TDMRep signal: well-known, header-only, or neither', () => {
  assert.equal(hasTdmRepSignal(true, undefined), true);
  assert.equal(hasTdmRepSignal(false, '1'), true);
  assert.equal(hasTdmRepSignal(false, ' 0 '), true);
  assert.equal(hasTdmRepSignal(false, ''), false);
  assert.equal(hasTdmRepSignal(false, undefined), false);
  assert.equal(hasTdmRepSignal(false, null), false);
});

test('parseRobotsSitemapUrls keeps same-origin Sitemap: entries in order', () => {
  const robots = `User-agent: *
Disallow: /drafts/
Sitemap: https://www.lilly.com/sitemap-index.xml
Sitemap: https://other.example/sitemap.xml
Sitemap: https://www.lilly.com/jp/sitemap.xml
Sitemap: https://www.lilly.com/sitemap-index.xml
`;
  assert.deepEqual(parseRobotsSitemapUrls(robots, 'https://www.lilly.com'), [
    'https://www.lilly.com/sitemap-index.xml',
    'https://www.lilly.com/jp/sitemap.xml',
  ]);
});

test('looksLikeSitemap accepts XML content-type or urlset/sitemapindex body', () => {
  assert.equal(
    looksLikeSitemap({
      ok: true,
      contentType: 'application/xml; charset=utf-8',
      bodyText: '',
    }),
    true,
  );
  assert.equal(
    looksLikeSitemap({
      ok: true,
      contentType: 'text/plain',
      bodyText:
        '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>',
    }),
    true,
  );
  assert.equal(
    looksLikeSitemap({
      ok: true,
      contentType: 'text/html',
      bodyText: '<html><div class="neterror"><div class="error-code">HTTP ERROR 404</div></div></html>',
    }),
    false,
  );
  assert.equal(looksLikeSitemap({ ok: false, contentType: 'application/xml', bodyText: '<urlset/>' }), false);
});

test('parseSitemapLastmod counts urlset lastmod coverage', () => {
  const body = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/a</loc><lastmod>2026-01-01</lastmod></url>
  <url><loc>https://example.com/b</loc></url>
  <url><loc>https://example.com/c</loc><lastmod>2026-02-01</lastmod></url>
  <url><loc>https://example.com/d</loc><lastmod>2026-03-01</lastmod></url>
</urlset>`;
  const stats = parseSitemapLastmod(body);
  assert.equal(stats.kind, 'urlset');
  assert.equal(stats.entryCount, 4);
  assert.equal(stats.withLastmod, 3);
  assert.equal(sitemapLastmodCoverageOk(stats.withLastmod, stats.entryCount), true);
  assert.equal(sitemapLastmodCoverageOk(1, 4), false);
  assert.equal(sitemapLastmodCoverageOk(1, 2), false);
  assert.equal(sitemapLastmodCoverageOk(2, 2), true);
});

test('parseSitemapLastmod extracts sitemapindex child locs and lastmod', () => {
  const body = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-a.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-b.xml</loc><lastmod>2026-01-01</lastmod></sitemap>
</sitemapindex>`;
  const stats = parseSitemapLastmod(body);
  assert.equal(stats.kind, 'sitemapindex');
  assert.equal(stats.entryCount, 2);
  assert.equal(stats.withLastmod, 1);
  assert.deepEqual(stats.childLocs, [
    'https://example.com/sitemap-a.xml',
    'https://example.com/sitemap-b.xml',
  ]);
  assert.equal(sitemapLastmodCoverageOk(stats.withLastmod, stats.entryCount), false);
});

test('isParseableHttpDate accepts HTTP-date values', () => {
  assert.equal(isParseableHttpDate('Wed, 21 Oct 2015 07:28:00 GMT'), true);
  assert.equal(isParseableHttpDate(''), false);
  assert.equal(isParseableHttpDate('not-a-date'), false);
  assert.equal(isParseableHttpDate(undefined), false);
});
