import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverLinks, isWithinStartPathScope } from '@lynx/crawler-core';
import {
  filterGeoEnqueueableLinks,
  forceGeoSkipExternal,
  geoPageUrlKey,
  geoStartPathPrefix,
  isGeoDocumentContentType,
  isGeoDocumentUrl,
  isGeoExternalUrl,
  isGeoOutOfScopeUrl,
} from '../lib/geo/origin-scope';
import { AuditStartSchema } from '../lib/validation';

const startUrl = 'https://www.novartis.com/';
const usEnStart = 'https://www.novartis.com/us-en/';

test('startUrl novartis.com does not queue youtube/google', () => {
  const html = `
    <html><body>
      <a href="https://www.novartis.com/news">News</a>
      <a href="/pipeline">Pipeline</a>
      <a href="https://www.youtube.com/watch?v=dQw4w9wgGc">YouTube</a>
      <a href="https://www.google.com/search?q=novartis">Google</a>
      <a href="https://fonts.googleapis.com/css?family=Inter">CDN</a>
    </body></html>
  `;
  const config = forceGeoSkipExternal({ startUrl, skipExternal: false });
  const discovered = discoverLinks(html, startUrl, config, 0);
  const queued = filterGeoEnqueueableLinks(discovered, config, new Set());
  const urls = queued.map((link) => link.url);

  assert.ok(urls.some((url) => url.includes('novartis.com/news')));
  assert.ok(urls.some((url) => url.includes('novartis.com/pipeline')));
  assert.equal(
    urls.some((url) => /youtube\.com|google\.com|googleapis\.com/i.test(url)),
    false,
    `off-origin URLs must not be queued: ${urls.join(', ')}`,
  );
  assert.equal(isGeoExternalUrl('https://www.youtube.com/watch?v=1', config), true);
  assert.equal(isGeoExternalUrl('https://www.google.com/', config), true);
  assert.equal(isGeoExternalUrl('https://www.novartis.com/science', config), false);
});

test('JSON skipExternal false is coerced to true on audit POST schema', () => {
  const parsed = AuditStartSchema.parse({
    startUrl,
    skipExternal: false,
    doNotTraverseBackward: false,
  });
  assert.equal(parsed.skipExternal, true);
  assert.equal(parsed.doNotTraverseBackward, true);
});

test('forceGeoSkipExternal also locks stay-in-start-path', () => {
  const config = forceGeoSkipExternal({ startUrl: usEnStart, skipExternal: false, doNotTraverseBackward: false });
  assert.equal(config.skipExternal, true);
  assert.equal(config.doNotTraverseBackward, true);
});

test('path prefix /us-en queues descendants and ignores same-host /news', () => {
  const html = `
    <html><body>
      <a href="https://www.novartis.com/us-en/about">About</a>
      <a href="/us-en/about/novartis-us">US</a>
      <a href="https://www.novartis.com/news">News</a>
      <a href="/pipeline">Pipeline</a>
      <a href="https://www.novartis.com/us-english">Lookalike prefix</a>
      <a href="https://www.youtube.com/watch?v=dQw4w9wgGc">YouTube</a>
    </body></html>
  `;
  const config = forceGeoSkipExternal({ startUrl: usEnStart });
  const discovered = discoverLinks(html, usEnStart, config, 0);
  const queued = filterGeoEnqueueableLinks(discovered, config, new Set());
  const urls = queued.map((link) => link.url);

  assert.ok(urls.some((url) => url.includes('/us-en/about')));
  assert.ok(urls.some((url) => url.includes('/us-en/about/novartis-us')));
  assert.equal(
    urls.some((url) => url.includes('/news') || url.includes('/pipeline') || url.includes('/us-english')),
    false,
    `off-path same-host URLs must not be queued: ${urls.join(', ')}`,
  );
  assert.equal(
    urls.some((url) => /youtube\.com/i.test(url)),
    false,
  );
  assert.equal(isGeoOutOfScopeUrl('https://www.novartis.com/us-en/about', config), false);
  assert.equal(isGeoOutOfScopeUrl('https://www.novartis.com/news', config), true);
  assert.equal(isGeoExternalUrl('https://www.novartis.com/news', config), false);
  assert.equal(isGeoExternalUrl('https://www.youtube.com/watch?v=1', config), true);
});

test('isWithinStartPathScope treats /us-en and descendants as in, /news as out', () => {
  assert.equal(isWithinStartPathScope(usEnStart, 'https://www.novartis.com/us-en/'), true);
  assert.equal(isWithinStartPathScope(usEnStart, 'https://www.novartis.com/us-en'), true);
  assert.equal(isWithinStartPathScope(usEnStart, 'https://www.novartis.com/us-en/about'), true);
  assert.equal(isWithinStartPathScope(usEnStart, 'https://www.novartis.com/us-en/about/leadership-team'), true);
  assert.equal(isWithinStartPathScope(usEnStart, 'https://www.novartis.com/news'), false);
  assert.equal(isWithinStartPathScope(usEnStart, 'https://www.novartis.com/'), false);
  assert.equal(isWithinStartPathScope(usEnStart, 'https://www.novartis.com/us-english'), false);
  assert.equal(isWithinStartPathScope(startUrl, 'https://www.novartis.com/news'), true);
  assert.equal(geoStartPathPrefix(usEnStart), '/us-en/');
  assert.equal(geoStartPathPrefix(startUrl), '/');
});

test('hash and trailing-slash variants collapse to one GEO page key', () => {
  const html = `
    <html><body>
      <a href="https://www.novartis.com/us-en/">Slash</a>
      <a href="https://www.novartis.com/us-en#main">Hash</a>
      <a href="https://www.novartis.com/us-en">Bare</a>
      <a href="/us-en/about#team">About hash</a>
      <a href="/us-en/about">About</a>
    </body></html>
  `;
  const config = forceGeoSkipExternal({ startUrl: usEnStart });
  const startKey = geoPageUrlKey(usEnStart);
  assert.equal(geoPageUrlKey('https://www.novartis.com/us-en#main'), startKey);
  assert.equal(geoPageUrlKey('https://www.novartis.com/us-en'), startKey);
  assert.equal(geoPageUrlKey('https://www.novartis.com/us-en/'), startKey);

  const discovered = discoverLinks(html, usEnStart, config, 0);
  const queued = filterGeoEnqueueableLinks(discovered, config, new Set([startKey]));
  const urls = queued.map((link) => link.url);

  assert.equal(
    urls.some((url) => geoPageUrlKey(url) === startKey),
    false,
    `start URL hash/slash duplicates must not re-queue: ${urls.join(', ')}`,
  );
  assert.equal(urls.filter((url) => url.includes('/us-en/about')).length, 1);
  assert.equal(
    urls.every((url) => !url.includes('#')),
    true,
    `queued URLs must be hashless: ${urls.join(', ')}`,
  );
});

test('document URLs are not queued from HTML links', () => {
  const html = `
    <html><body>
      <a href="/about">About</a>
      <a href="/files/report.pdf">Report</a>
      <a href="/deck.pptx">Deck</a>
      <a href="/data/sheet.xlsx">Sheet</a>
    </body></html>
  `;
  const config = forceGeoSkipExternal({ startUrl });
  const discovered = discoverLinks(html, startUrl, config, 0);
  const queued = filterGeoEnqueueableLinks(discovered, config, new Set());
  const urls = queued.map((link) => link.url);

  assert.ok(urls.some((url) => url.includes('/about')));
  assert.equal(
    urls.some((url) => /\.(pdf|pptx|xlsx)(\?|$)/i.test(url)),
    false,
    `document URLs must not be queued: ${urls.join(', ')}`,
  );
});

test('isGeoDocumentUrl matches extensions case-insensitively and ignores query', () => {
  assert.equal(isGeoDocumentUrl('https://www.novartis.com/files/report.pdf'), true);
  assert.equal(isGeoDocumentUrl('https://www.novartis.com/files/REPORT.PDF'), true);
  assert.equal(isGeoDocumentUrl('https://www.novartis.com/files/report.pdf?dl=1'), true);
  assert.equal(isGeoDocumentUrl('https://www.novartis.com/files/report.pdf#section'), true);
  assert.equal(isGeoDocumentUrl('https://www.novartis.com/about'), false);
  assert.equal(isGeoDocumentUrl('https://www.novartis.com/files/report.pdf.html'), false);
});

test('isGeoDocumentContentType detects document MIME types but not HTML', () => {
  assert.equal(isGeoDocumentContentType('application/pdf'), true);
  assert.equal(isGeoDocumentContentType('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), true);
  assert.equal(isGeoDocumentContentType('text/html; charset=utf-8'), false);
  assert.equal(isGeoDocumentContentType('application/xhtml+xml'), false);
});
