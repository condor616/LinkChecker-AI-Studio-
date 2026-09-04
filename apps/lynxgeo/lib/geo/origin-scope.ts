import {
  getTraversalSkipReason,
  getUrlWithoutHash,
  isWithinStartPathScope,
  type CrawlConfig,
  type DiscoveredLink,
} from '@lynx/crawler-core';
import {
  isGeoDocumentContentType,
  isGeoDocumentUrl,
  isGeoHtmlPage,
  isGeoNonHtmlTarget,
  isGeoNonPageFile,
} from './document-url';

export type GeoScopedConfig = { skipExternal: true; doNotTraverseBackward: true };

export {
  isGeoDocumentContentType,
  isGeoDocumentUrl,
  isGeoHtmlPage,
  isGeoNonHtmlTarget,
  isGeoNonPageFile,
};

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
    if (isGeoNonHtmlTarget(url)) continue;
    added.add(url);
    queued.push({ ...link, url });
  }
  return queued;
}
