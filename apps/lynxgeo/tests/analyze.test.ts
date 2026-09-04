import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FetchedResource } from '@lynx/crawler-core';
import { analyzePage } from '../lib/geo/analyze';

function resource(over: Partial<FetchedResource> = {}): FetchedResource {
  return {
    url: 'https://www.example.com/news/story',
    fetchUrl: 'https://www.example.com/news/story',
    ok: true,
    statusCode: 200,
    contentType: 'text/html',
    headers: {},
    bodyText: '',
    blockedBySsrf: false,
    authGated: false,
    skipReason: null,
    error: null,
    ...over,
  };
}

test('date finding names the page and the selectors that were checked', () => {
  const html = '<html lang="en"><head><title>Story</title></head><body><h1>Story</h1><p>Hello</p></body></html>';
  const findings = analyzePage(resource(), html);
  const date = findings.find((f) => f.id.startsWith('date-'));
  assert.ok(date);
  assert.equal(date.severity, 'warn');
  assert.equal(date.url, 'https://www.example.com/news/story');
  assert.match(date.detail, /article:published_time/);
  assert.match(date.detail, /https:\/\/www\.example\.com\/news\/story/);
  assert.match(date.suggestion, /https:\/\/www\.example\.com\/news\/story/);
});

test('date finding reports observed markup when present', () => {
  const html =
    '<html lang="en"><head><title>Story</title><meta property="article:published_time" content="2026-01-02"></head><body><h1>Story</h1><time datetime="2026-01-02">Jan 2</time></body></html>';
  const findings = analyzePage(resource(), html);
  const date = findings.find((f) => f.id.startsWith('date-'));
  assert.equal(date?.severity, 'pass');
  assert.match(date?.detail || '', /article:published_time="2026-01-02"/);
  assert.match(date?.detail || '', /<time>/);
});

test('http failure includes status and content-type', () => {
  const findings = analyzePage(
    resource({ ok: false, statusCode: 404, contentType: 'text/html', error: 'Not Found' }),
    null,
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /HTTP 404/);
  assert.match(findings[0].detail, /text\/html/);
  assert.equal(findings[0].url, 'https://www.example.com/news/story');
});

test('sitemap.xml is not scored for HTML title checks', () => {
  const sitemapBody =
    '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.novartis.com/</loc></url></urlset>';
  const findings = analyzePage(
    resource({
      url: 'https://www.novartis.com/sitemap.xml',
      contentType: 'application/xml',
      bodyText: sitemapBody,
    }),
    null,
  );
  assert.equal(findings.length, 0);
  assert.equal(findings.some((f) => f.id.startsWith('title-')), false);
});

test('sitemap.xml served as text/html is still not scored for title', () => {
  const sitemapBody =
    '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.novartis.com/</loc></url></urlset>';
  const findings = analyzePage(
    resource({
      url: 'https://www.novartis.com/sitemap.xml',
      contentType: 'text/html; charset=utf-8',
      bodyText: sitemapBody,
    }),
    sitemapBody,
  );
  assert.equal(findings.length, 0);
  assert.equal(
    findings.some((f) => f.id.startsWith('title-')),
    false,
    'XML sitemaps must not fail the HTML <title> check even when Content-Type is text/html',
  );
});

test('PDF URLs are not scored for HTML title checks', () => {
  const findings = analyzePage(
    resource({
      url: 'https://www.novartis.com/files/report.pdf',
      contentType: 'text/html',
      bodyText: '<html><body>PDF preview</body></html>',
    }),
    '<html><body>PDF preview</body></html>',
  );
  assert.equal(findings.some((f) => f.id.startsWith('title-')), false);
});

const pageHtml = (robotsContent?: string) => {
  const robots = robotsContent
    ? `<meta name="robots" content="${robotsContent}">`
    : '';
  return `<html lang="en"><head><title>Story</title>${robots}</head><body><h1>Story</h1><p>Hello world content here.</p></body></html>`;
};

test('noai absent when neither meta nor header set', () => {
  const findings = analyzePage(resource(), pageHtml());
  const noai = findings.find((f) => f.id.startsWith('noai-'));
  assert.ok(noai);
  assert.equal(noai.severity, 'pass');
  assert.match(noai.title, /No noai/);
  assert.match(noai.detail, /neither meta robots nor X-Robots-Tag/);
});

test('noai present via meta robots only', () => {
  const findings = analyzePage(resource(), pageHtml('index, noai'));
  const noai = findings.find((f) => f.id.startsWith('noai-'));
  assert.equal(noai?.severity, 'pass');
  assert.match(noai?.title || '', /opt-out/);
  assert.match(noai?.detail || '', /meta robots/);
  assert.doesNotMatch(noai?.detail || '', /X-Robots-Tag/);
});

test('noai present via X-Robots-Tag only', () => {
  const findings = analyzePage(
    resource({ headers: { 'x-robots-tag': 'noimageai' } }),
    pageHtml(),
  );
  const noai = findings.find((f) => f.id.startsWith('noai-'));
  assert.equal(noai?.severity, 'pass');
  assert.match(noai?.detail || '', /X-Robots-Tag/);
  assert.doesNotMatch(noai?.detail || '', /meta robots and/);
});

test('noai present via both meta and header', () => {
  const findings = analyzePage(
    resource({ headers: { 'x-robots-tag': 'noai, noimageai' } }),
    pageHtml('noai'),
  );
  const noai = findings.find((f) => f.id.startsWith('noai-'));
  assert.equal(noai?.severity, 'pass');
  assert.match(noai?.detail || '', /meta robots and X-Robots-Tag/);
});
