import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_MAX_DATE_CHECK_URLS,
  articleSectionPrefix,
  extractNewsListingLinks,
  isSameOriginListing,
  urlsShareArticleSection,
} from '../lib/geo/news-listing';
import {
  needsNewsListingPrompt,
  withNewsListingChecked,
  withNewsListingDismissed,
  withNewsListingPending,
  withNewsListingStarted,
} from '../lib/geo/news-listing-prompt';
import {
  forceGeoSkipExternal,
  isDateCheckPinnedTarget,
  isGeoOutOfScopeUrl,
} from '../lib/geo/origin-scope';
import { mergeArticleDateCheckFindings } from '../lib/geo/apply-article-date-check';
import { collectAuditFindings, CRITERION_CATALOG } from '../lib/geo/score';
import { DateCheckStartSchema } from '../lib/validation';

test('articleSectionPrefix drops the final slug', () => {
  assert.equal(articleSectionPrefix('https://ex.com/news/press/2024/my-story'), '/news/press/2024/');
  assert.equal(articleSectionPrefix('https://ex.com/insights/foo'), '/insights/');
  assert.equal(articleSectionPrefix('https://ex.com/insights/foo/'), '/insights/');
  assert.equal(articleSectionPrefix('https://ex.com/story'), '/');
  assert.equal(articleSectionPrefix('not-a-url'), null);
});

test('urlsShareArticleSection matches section peers', () => {
  const sample = 'https://ex.com/news/press/2024/my-story';
  assert.equal(urlsShareArticleSection('https://ex.com/news/press/2024/other', sample), true);
  assert.equal(urlsShareArticleSection('https://ex.com/news/press/other', sample), false);
  assert.equal(urlsShareArticleSection('https://ex.com/medicines/help.html', sample), false);
  assert.equal(urlsShareArticleSection('https://other.com/news/press/2024/x', sample), false);
});

test('extractNewsListingLinks keeps same-origin HTML links in order and caps', () => {
  const html = `
    <html><body>
      <a href="/news/a">A</a>
      <a href="https://www.example.com/news/b">B</a>
      <a href="https://other.example/x">off</a>
      <a href="mailto:x@y.com">mail</a>
      <a href="/files/report.pdf">pdf</a>
      <a href="#frag">frag</a>
      <a href="/news/a">dup</a>
      <a href="/news/c/">C</a>
    </body></html>
  `;
  const links = extractNewsListingLinks(html, 'https://www.example.com/news', { maxUrls: 10 });
  assert.deepEqual(links, [
    'https://www.example.com/news/a',
    'https://www.example.com/news/b',
    'https://www.example.com/news/c',
  ]);
});

test('extractNewsListingLinks excludes nav/header/footer chrome', () => {
  const html = `
    <html><body>
      <header><a href="/about">About</a></header>
      <nav><a href="/products">Products</a></nav>
      <main>
        <a href="/news/one">One</a>
        <a href="/news/two">Two</a>
      </main>
      <footer><a href="/legal">Legal</a></footer>
    </body></html>
  `;
  const links = extractNewsListingLinks(html, 'https://www.example.com/news', {
    maxUrls: 10,
    articleUrl: 'https://www.example.com/news/one',
  });
  assert.deepEqual(links, [
    'https://www.example.com/news/one',
    'https://www.example.com/news/two',
  ]);
});

test('extractNewsListingLinks filters by sample article section and always includes sample', () => {
  const html = `
    <html><body>
      <nav><a href="/home">Home</a></nav>
      <main>
        <a href="/news/2024/alpha">Alpha</a>
        <a href="/news/2024/beta">Beta</a>
        <a href="/medicines/help">Help</a>
        <a href="/insights/foo">Insight</a>
      </main>
    </body></html>
  `;
  const links = extractNewsListingLinks(html, 'https://www.example.com/news', {
    maxUrls: 10,
    articleUrl: 'https://www.example.com/news/2024/gamma',
  });
  assert.ok(links.includes('https://www.example.com/news/2024/gamma'));
  assert.ok(links.includes('https://www.example.com/news/2024/alpha'));
  assert.ok(links.includes('https://www.example.com/news/2024/beta'));
  assert.equal(links.includes('https://www.example.com/medicines/help'), false);
  assert.equal(links.includes('https://www.example.com/insights/foo'), false);
  assert.equal(links.includes('https://www.example.com/home'), false);
});

test('extractNewsListingLinks respects maxUrls cap', () => {
  const html = `<html><body>
    <a href="/1">1</a><a href="/2">2</a><a href="/3">3</a>
  </body></html>`;
  const links = extractNewsListingLinks(html, 'https://example.com/', { maxUrls: 2 });
  assert.equal(links.length, 2);
  assert.equal(DEFAULT_MAX_DATE_CHECK_URLS, 30);
});

test('isSameOriginListing validates origin', () => {
  assert.equal(isSameOriginListing('https://a.example/news', 'https://a.example/'), true);
  assert.equal(isSameOriginListing('https://b.example/news', 'https://a.example/'), false);
  assert.equal(isSameOriginListing('not-a-url', 'https://a.example/'), false);
});

test('DateCheckStartSchema requires article URL only', () => {
  const parsed = DateCheckStartSchema.parse({
    articleUrl: 'https://news.bms.com/news/details/2024/story',
  });
  assert.equal(parsed.articleUrl, 'https://news.bms.com/news/details/2024/story');
  assert.throws(() => DateCheckStartSchema.parse({}));
  assert.throws(() => DateCheckStartSchema.parse({ articleUrl: 'not-a-url' }));
  const withExtra = DateCheckStartSchema.parse({
    articleUrl: 'https://news.bms.com/a',
    listingUrl: 'https://www.bms.com/news',
  });
  assert.equal(withExtra.articleUrl, 'https://news.bms.com/a');
});

test('pinned date-check target on subdomain is recognized even when out of GEO scope', () => {
  const config = forceGeoSkipExternal({
    startUrl: 'https://www.bms.com/',
    skipExternal: true,
  });
  const article = 'https://news.bms.com/news/details/2024/story';
  assert.equal(isGeoOutOfScopeUrl(article, config), true, 'subdomain remains out of scope for discovery');
  assert.equal(isDateCheckPinnedTarget(article, [article]), true);
  assert.equal(isDateCheckPinnedTarget(`${article}#top`, [article]), true);
  assert.equal(isDateCheckPinnedTarget('https://www.bms.com/other', [article]), false);
});

test('news listing prompt pending / dismiss / checked', () => {
  const pending = withNewsListingPending({ citeability: 70 });
  assert.equal(needsNewsListingPrompt(pending), true);
  const dismissed = withNewsListingDismissed(pending);
  assert.equal(needsNewsListingPrompt(dismissed), false);
  assert.equal(dismissed.newsListingPrompt?.status, 'dismissed');
  assert.equal(dismissed.needsNewsListing, true);
  const started = withNewsListingStarted(pending, 'https://a.example/news', 'audit-2');
  assert.equal(needsNewsListingPrompt(started), false);
  assert.equal(started.newsListingPrompt?.followUpAuditId, 'audit-2');
  const checked = withNewsListingChecked(pending, 'https://news.example/story');
  assert.equal(needsNewsListingPrompt(checked), false);
  assert.equal(checked.needsNewsListing, false);
  assert.equal(checked.newsListingPrompt?.status, 'checked');
  assert.equal(checked.newsListingPrompt?.articleUrl, 'https://news.example/story');
});

test('mergeArticleDateCheckFindings replaces date-unidentified and adds article findings', () => {
  const existing = [
    {
      id: 'date-unidentified',
      category: 'citeability' as const,
      title: 'Could not detect news pages for date metatags',
      detail: 'gap',
      severity: 'warn' as const,
      standard: 'established' as const,
      suggestion: '',
    },
    {
      id: 'https-https://www.example.com/',
      category: 'citeability' as const,
      title: 'HTTPS',
      detail: 'ok',
      severity: 'pass' as const,
      standard: 'established' as const,
      suggestion: '',
      url: 'https://www.example.com/',
    },
  ];
  const pageFindings = [
    {
      id: 'date-https://news.example.com/story',
      category: 'citeability' as const,
      title: 'No visible date markup',
      detail: 'missing',
      severity: 'warn' as const,
      standard: 'established' as const,
      suggestion: 'add dates',
      url: 'https://news.example.com/story',
    },
  ];
  const merged = mergeArticleDateCheckFindings({
    existingFindings: existing,
    pageFindings,
    articleUrl: 'https://news.example.com/story',
  });
  assert.equal(merged.some((f) => f.id === 'date-unidentified'), false);
  assert.ok(merged.some((f) => f.id === 'date-https://news.example.com/story'));
  const summary = merged.find((f) => f.id === 'date-check-listing');
  assert.equal(summary?.severity, 'warn');
  assert.match(summary?.detail || '', /news\.example\.com\/story/);
  assert.ok(merged.some((f) => f.id === 'https-https://www.example.com/'));
});

test('dismiss keeps date-unidentified in snapshot findings / criteria', () => {
  const snapshotFindings = [
    {
      id: 'date-unidentified',
      category: 'citeability',
      title: 'Could not detect news pages for date metatags',
      detail: 'We could not detect news/article pages on this crawl.',
      severity: 'warn' as const,
      standard: 'established' as const,
      suggestion: 'Provide a sample news article URL.',
    },
  ];
  const pending = withNewsListingPending({ citeability: 70, playbook: [] });
  const dismissed = withNewsListingDismissed(pending);
  assert.equal(needsNewsListingPrompt(dismissed), false);

  const collected = collectAuditFindings({
    snapshotFindings,
    pages: [],
    playbook: Array.isArray(dismissed.playbook) ? dismissed.playbook : [],
  });
  assert.ok(collected.some((f) => f.id === 'date-unidentified'));

  const catalog = CRITERION_CATALOG.find((c) => c.key === 'date-unidentified');
  assert.match(catalog?.title || '', /Could not detect news pages/i);
  assert.match(catalog?.why || '', /Cancel hides the interactive prompt but keeps this warn/i);
});
