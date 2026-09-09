import { isTargetUrlMatch } from './url';

export type ScanLink = {
  url: string;
  parentUrl?: string | null;
  status: string;
  statusCode?: number | null;
  error?: string | null;
  type?: string | null;
  snippet?: string | null;
  isRechecked?: boolean | null;
  cloudflareChallenge?: boolean | null;
  bypassAttempted?: boolean | null;
  [key: string]: unknown;
};

export type ScanLinkConfig = {
  startUrl?: string;
  isTargeted?: boolean;
  targetUrls?: string[];
  excludeSubdomains?: boolean;
  phase?: 'crawling' | 'cloudflare';
  bypassCloudflare?: boolean;
  [key: string]: unknown;
};

export type LinkGroup = {
  url: string;
  normalizedKey?: string;
  instances: ScanLink[];
  count: number;
  status?: string;
  [key: string]: unknown;
};

export function parseScanConfigJson(raw: unknown): ScanLinkConfig {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === 'object') return raw as ScanLinkConfig;
  return {};
}

export function isUrlInternalForScan(url: string, config: ScanLinkConfig): boolean {
  const startUrl = config.startUrl || '';
  const internalDomain = startUrl ? new URL(startUrl).hostname.toLowerCase().replace(/^www\./, '') : '';
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return host === internalDomain || (host.endsWith('.' + internalDomain) && !config.excludeSubdomains);
  } catch {
    return url.startsWith('/');
  }
}

export function matchesScanTarget(url: string, config: ScanLinkConfig): boolean {
  const targetUrls = config.targetUrls || [];
  return targetUrls.some((target) => isTargetUrlMatch(url, target));
}

/** Still blocked by a Cloudflare (or CF-classified) challenge — not yet unlocked. */
export function isCloudflareProtectedLink(link: ScanLink): boolean {
  return link.status === 'CHALLENGED';
}

/** Unlocked after a Cloudflare challenge (shown under Re-checked). */
export function isSolvedCloudflareLink(link: ScanLink): boolean {
  return link.status === 'SUCCESS' && !!link.cloudflareChallenge;
}

/**
 * Triage dashboard filter: skipped links on relevant pages, targeted-scan
 * extras for broken links found on a target page, otherwise internal parents.
 */
export function filterTriageLinks(links: ScanLink[], config: ScanLinkConfig): ScanLink[] {
  const isTargeted = !!config.isTargeted && (config.targetUrls?.length || 0) > 0;

  return links.filter((l) => {
    if (l.status === 'SKIPPED' || l.status === 'CHALLENGED') {
      if (isTargeted) {
        return !l.parentUrl || matchesScanTarget(l.parentUrl, config) || matchesScanTarget(l.url, config);
      }
      const parent = l.parentUrl;
      if (!parent) return true;
      return isUrlInternalForScan(parent, config);
    }

    if (isTargeted) {
      if (matchesScanTarget(l.url, config)) return true;
      if ((l.status === 'BROKEN' || isCloudflareProtectedLink(l)) && l.parentUrl) {
        return matchesScanTarget(l.parentUrl, config);
      }
      return false;
    }

    const parent = l.parentUrl;
    if (!parent) return true;
    return isUrlInternalForScan(parent, config);
  });
}

export function groupLinks(links: ScanLink[]): LinkGroup[] {
  const grouped: Record<string, ScanLink[]> = {};
  links.forEach((link) => {
    const normalizedUrl = link.url.replace(/^https?:\/\//, '').toLowerCase();
    if (!grouped[normalizedUrl]) {
      grouped[normalizedUrl] = [];
    }
    grouped[normalizedUrl].push(link);
  });
  return Object.entries(grouped).map(([normalizedKey, instances]) => {
    return {
      ...instances[0],
      url: instances[0].url,
      normalizedKey,
      instances,
      count: instances.length,
    };
  });
}

export function groupLinksBySource(links: ScanLink[]): LinkGroup[] {
  const grouped: Record<string, ScanLink[]> = {};
  links.forEach((link) => {
    const source = link.parentUrl || 'Entry Point';
    if (!grouped[source]) {
      grouped[source] = [];
    }
    grouped[source].push(link);
  });
  return Object.entries(grouped).map(([source, instances]) => ({
    url: source,
    instances,
    status: instances.some((i) => i.status === 'BROKEN' || i.status === 'CHALLENGED')
      ? instances.some((i) => i.status === 'BROKEN')
        ? 'BROKEN'
        : 'CHALLENGED'
      : 'SUCCESS',
    count: instances.length,
  }));
}

export function buildTriageGroups(links: ScanLink[], config: ScanLinkConfig, viewMode: 'url' | 'source') {
  const filteredLinks = filterTriageLinks(links, config);
  const uniqueFilteredLinks = groupLinks(filteredLinks);
  const brokenLinksRaw = filteredLinks.filter((l) => l.status === 'BROKEN');
  // Still-challenged only — solved CF URLs leave this bucket.
  const cloudflareLinksRaw = filteredLinks.filter((l) => isCloudflareProtectedLink(l));
  // Finished rechecks / CF unlocks. Never dual-list with CloudFlare or Broken.
  const recheckedLinksRaw = filteredLinks.filter(
    (l) =>
      l.status !== 'CHALLENGED' &&
      l.status !== 'BROKEN' &&
      (!!l.isRechecked || isSolvedCloudflareLink(l)),
  );
  const successLinksRaw = filteredLinks.filter(
    (l) => l.status === 'SUCCESS' && !l.isRechecked && !l.cloudflareChallenge,
  );
  const skippedLinksRaw = filteredLinks.filter((l) => l.status === 'SKIPPED' && !l.isRechecked);
  const group = viewMode === 'url' ? groupLinks : groupLinksBySource;

  return {
    filteredLinks,
    uniqueFilteredLinks,
    brokenLinksRaw,
    successLinksRaw,
    skippedLinksRaw,
    cloudflareLinksRaw,
    recheckedLinksRaw,
    brokenLinks: groupLinks(brokenLinksRaw),
    successLinks: groupLinks(successLinksRaw),
    skippedLinks: groupLinks(skippedLinksRaw),
    cloudflareLinks: groupLinks(cloudflareLinksRaw),
    recheckedLinks: groupLinks(recheckedLinksRaw),
    currentBrokenGroups: group(brokenLinksRaw),
    currentSuccessGroups: group(successLinksRaw),
    currentSkippedGroups: group(skippedLinksRaw),
    currentCloudflareGroups: group(cloudflareLinksRaw),
    currentRecheckedGroups: group(recheckedLinksRaw),
    targetedGroups: uniqueFilteredLinks,
  };
}

/** Links that still count toward in-progress crawl/bypass work. */
export function isLinkStillInProgress(link: ScanLink): boolean {
  if (link.status === 'PENDING' || link.status === 'PROCESSING') return true;
  if (link.status === 'CHALLENGED' && !link.bypassAttempted) return true;
  return false;
}
