import {
  getTraversalSkipReason,
  getUrlWithoutHash,
  isWithinStartPathScope,
  type CrawlConfig,
  type DiscoveredLink,
} from '@lynx/crawler-core';

export type GeoScopedConfig = { skipExternal: true; doNotTraverseBackward: true };

/** Path extensions GEO must not crawl or score as HTML pages. */
const GEO_DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'docm',
  'xls',
  'xlsx',
  'xlsm',
  'ppt',
  'pptx',
  'pptm',
  'odt',
  'ods',
  'odp',
  'rtf',
  'xml',
  'txt',
  'json',
]);

/** True when the URL pathname ends with a document extension (case-insensitive). */
export function isGeoDocumentUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, '');
    const dot = pathname.lastIndexOf('.');
    if (dot < 0) return false;
    return GEO_DOCUMENT_EXTENSIONS.has(pathname.slice(dot + 1).toLowerCase());
  } catch {
    return false;
  }
}

/** True when Content-Type indicates a document rather than HTML. */
export function isGeoDocumentContentType(contentType: string | null | undefined): boolean {
  const type = (contentType || '').toLowerCase();
  if (!type) return false;
  if (type.includes('html')) return false;
  return (
    type.includes('application/pdf') ||
    type.includes('application/msword') ||
    type.includes('application/vnd.ms-excel') ||
    type.includes('application/vnd.ms-powerpoint') ||
    type.includes('application/vnd.openxmlformats-officedocument') ||
    type.includes('application/vnd.oasis.opendocument') ||
    type.includes('application/rtf') ||
    type.includes('text/rtf') ||
    type.includes('xml') ||
    type === 'text/plain' ||
    type.includes('application/json')
  );
}

/** True when a fetched resource should be scored with HTML page checks (title, H1, etc.). */
export function isGeoHtmlPage(
  resource: { url: string; contentType?: string | null; bodyText?: string | null },
  html: string | null,
): boolean {
  if (html) return true;
  if (isGeoDocumentUrl(resource.url) || isGeoDocumentContentType(resource.contentType)) return false;
  const type = (resource.contentType || '').toLowerCase();
  if (type.includes('html') || type.includes('xhtml')) return true;
  const body = (resource.bodyText || '').trimStart();
  if (body.startsWith('<?xml') || body.startsWith('<urlset') || body.startsWith('<sitemapindex')) return false;
  if (body.startsWith('<!DOCTYPE html') || /^<html[\s>]/i.test(body)) return true;
  return false;
}

/**
 * GEO always stays on-origin and under the start URL path, even if a form/JSON/template
 * set skipExternal or doNotTraverseBackward false. LynxScan still treats those flags as optional.
 */
export function forceGeoSkipExternal<T extends Record<string, unknown>>(config: T): T & GeoScopedConfig {
  return { ...config, skipExternal: true, doNotTraverseBackward: true };
}

/** Hashless canonical key so /us-en/, /us-en, and /us-en#main are one page. */
export function geoPageUrlKey(url: string): string {
  return getUrlWithoutHash(url);
}

export function geoStartPathPrefix(startUrl: string): string {
  try {
    const pathname = new URL(startUrl).pathname || '/';
    const cleaned = pathname.replace(/\/+$/, '');
    return !cleaned || cleaned === '/' ? '/' : `${cleaned}/`;
  } catch {
    return '/';
  }
}

function geoScopedConfig(config: CrawlConfig): CrawlConfig & GeoScopedConfig {
  return { ...config, skipExternal: true, doNotTraverseBackward: true };
}

function geoTraversalSkipReason(url: string, config: CrawlConfig): string | null {
  try {
    void new URL(url);
  } catch {
    return 'Invalid URL';
  }
  return getTraversalSkipReason(url, geoScopedConfig(config), 'SUCCESS');
}

/**
 * True when crawler-core would treat the URL as external under skipExternal.
 * Uses getTraversalSkipReason (LynxScan applies this after verifying; GEO uses it to never enqueue).
 */
export function isGeoExternalUrl(url: string, config: CrawlConfig): boolean {
  const reason = geoTraversalSkipReason(url, config);
  return !!reason && reason.startsWith('External link');
}

/** Off-origin, off-path, or unparseable — GEO must not fetch or score these as pages. */
export function isGeoOutOfScopeUrl(url: string, config: CrawlConfig): boolean {
  if (geoTraversalSkipReason(url, config)) return true;
  return !isWithinStartPathScope(config.startUrl, url);
}

export function filterGeoEnqueueableLinks(
  discovered: DiscoveredLink[],
  config: CrawlConfig,
  seen: Set<string>,
): DiscoveredLink[] {
  const queued: DiscoveredLink[] = [];
  const added = new Set<string>();
  for (const link of discovered) {
    const url = geoPageUrlKey(link.url);
    if (seen.has(url) || added.has(url)) continue;
    if (isGeoOutOfScopeUrl(url, config)) continue;
    if (isGeoDocumentUrl(url)) continue;
    added.add(url);
    queued.push({ ...link, url });
  }
  return queued;
}
