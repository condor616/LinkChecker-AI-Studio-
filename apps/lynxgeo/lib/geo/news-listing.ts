import * as cheerio from 'cheerio';
import { geoPageUrlKey, isGeoNonHtmlTarget } from './origin-scope';

export const DEFAULT_MAX_DATE_CHECK_URLS = 30;

const CHROME_CLOSEST = 'nav, header, footer, [role="navigation"]';

/**
 * Path section for a sample article: all pathname segments except the final slug,
 * always ending with `/`. Single-segment articles → `/`.
 *
 * `/news/press/2024/my-story` → `/news/press/2024/`
 * `/insights/foo` → `/insights/`
 * `/story` → `/`
 */
export function articleSectionPrefix(articleUrl: string): string | null {
  try {
    const url = new URL(articleUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length <= 1) return '/';
    return `/${segments.slice(0, -1).join('/')}/`;
  } catch {
    return null;
  }
}

/** True when candidate pathname is under the sample article's section prefix. */
export function urlsShareArticleSection(candidateUrl: string, articleUrl: string): boolean {
  const prefix = articleSectionPrefix(articleUrl);
  if (prefix == null) return false;
  try {
    const candidate = new URL(candidateUrl);
    const article = new URL(articleUrl);
    if (candidate.origin !== article.origin) return false;
    let path = candidate.pathname || '/';
    if (!path.endsWith('/')) path = `${path}/`;
    if (prefix === '/') {
      // Single-segment sample: only other single-segment paths (not nested site sections).
      const segs = candidate.pathname.split('/').filter(Boolean);
      return segs.length === 1;
    }
    return path.startsWith(prefix) || candidate.pathname === prefix.slice(0, -1);
  } catch {
    return false;
  }
}

/**
 * Collect unique same-origin HTML page URLs linked from a news listing page.
 * Skips nav/header/footer chrome. When `articleUrl` is set, keeps only links in
 * the sample article's path section (and always includes the sample itself).
 */
export function extractNewsListingLinks(
  html: string,
  listingUrl: string,
  options?: { maxUrls?: number; articleUrl?: string },
): string[] {
  const maxUrls = options?.maxUrls ?? DEFAULT_MAX_DATE_CHECK_URLS;
  const articleUrl = options?.articleUrl?.trim() || '';
  let listing: URL;
  try {
    listing = new URL(listingUrl);
  } catch {
    return [];
  }

  let articleKey = '';
  if (articleUrl) {
    try {
      const article = new URL(articleUrl);
      if (article.origin !== listing.origin) {
        // Cross-origin sample cannot filter; return empty rather than all links.
        return [];
      }
      articleKey = geoPageUrlKey(article.toString());
    } catch {
      return [];
    }
  }

  const $ = cheerio.load(html || '');
  const out: string[] = [];
  const seen = new Set<string>();
  const listingKey = geoPageUrlKey(listing.toString());

  $('a[href]').each((_, el) => {
    if (out.length >= maxUrls) return false;
    const node = $(el);
    if (node.closest(CHROME_CLOSEST).length > 0) return;

    const href = (node.attr('href') || '').trim();
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;
    let absolute: URL;
    try {
      absolute = new URL(href, listing);
    } catch {
      return;
    }
    if (absolute.origin !== listing.origin) return;
    absolute.hash = '';
    const hrefStr = absolute.toString();
    if (isGeoNonHtmlTarget(hrefStr)) return;
    const key = geoPageUrlKey(hrefStr);
    if (!key || key === listingKey || seen.has(key)) return;
    if (articleUrl && !urlsShareArticleSection(key, articleUrl)) return;
    seen.add(key);
    out.push(key);
  });

  if (articleKey && !seen.has(articleKey) && articleKey !== listingKey) {
    // Prefer keeping the sample even when not linked from the listing HTML.
    if (out.length >= maxUrls) out.pop();
    out.unshift(articleKey);
  }

  return out.slice(0, maxUrls);
}

/** True when URL is same-origin as the audit start URL. */
export function isSameOriginListing(listingUrl: string, startUrl: string): boolean {
  try {
    return new URL(listingUrl).origin === new URL(startUrl).origin;
  } catch {
    return false;
  }
}
