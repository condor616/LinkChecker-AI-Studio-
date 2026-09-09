import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseChromiumNetErrorStatus } from '@lynx/crawler-core';
import {
  headersForHost,
  seedManualCloudflareSession,
  upsertMemorySession,
  withGeoCloudflareDefaults,
} from '../lib/geo/cf-unlock';

test('seedManualCloudflareSession applies cookieHeader to start host', () => {
  const seeded = seedManualCloudflareSession({
    startUrl: 'https://www.lilly.com/',
    cookieHeader: 'cf_clearance=abc; __cf_bm=xyz',
    customUserAgent: 'Mozilla/5.0 TestAgent',
  });
  const headers = headersForHost(seeded, 'https://www.lilly.com/about');
  assert.equal(headers.Cookie, 'cf_clearance=abc; __cf_bm=xyz');
  assert.equal(headers['User-Agent'], 'Mozilla/5.0 TestAgent');
});

test('upsertMemorySession stores host sessions for reuse', () => {
  let config = withGeoCloudflareDefaults({
    startUrl: 'https://example.com/',
    bypassCloudflare: true,
  });
  config = upsertMemorySession(config, 'example.com', {
    cookieHeader: 'cf_clearance=tok',
    userAgent: 'FlareUA',
  });
  const headers = headersForHost(config, 'https://example.com/page');
  assert.equal(headers.Cookie, 'cf_clearance=tok');
  assert.equal(headers['User-Agent'], 'FlareUA');
});

test('Chromium FlareSolverr 404 interstitial is not treated as HTTP 200 success', () => {
  const flareHtml = `<html><body class="neterror">
    <div class="icon-generic"></div>
    <div class="error-code">HTTP ERROR 404</div>
  </body></html>`;
  assert.equal(parseChromiumNetErrorStatus(flareHtml), 404);
});
