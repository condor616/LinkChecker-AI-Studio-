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
  [key: string]: unknown;
};

export type ScanLinkConfig = {
  startUrl?: string;
  isTargeted?: boolean;
  targetUrls?: string[];
  excludeSubdomains?: boolean;
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

/**
 * Triage dashboard filter: skipped links on relevant pages, targeted-scan
 * extras for broken links found on a target page, otherwise internal parents.
 */
export function filterTriageLinks(links: ScanLink[], config: ScanLinkConfig): ScanLink[] {
  const isTargeted = !!config.isTargeted && (config.targetUrls?.length || 0) > 0;

  return links.filter((l) => {
    if (l.status === 'SKIPPED') {
      if (isTargeted) {
        return !l.parentUrl || matchesScanTarget(l.parentUrl, config);
      }
      const parent = l.parentUrl;
      if (!parent) return true;
      return isUrlInternalForScan(parent, config);
    }

    if (isTargeted) {
      if (matchesScanTarget(l.url, config)) return true;
      if (l.status === 'BROKEN' && l.parentUrl) {
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
    const displayUrl = instances.find((inst) => inst.url.startsWith('https'))?.url || instances[0].url;
    return {
      url: displayUrl,
      normalizedKey,
      instances,
      ...instances[0],
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
    status: instances.some((i) => i.status === 'BROKEN') ? 'BROKEN' : 'SUCCESS',
    count: instances.length,
  }));
}

export function buildTriageGroups(links: ScanLink[], config: ScanLinkConfig, viewMode: 'url' | 'source') {
  const filteredLinks = filterTriageLinks(links, config);
  const uniqueFilteredLinks = groupLinks(filteredLinks);
  const brokenLinksRaw = filteredLinks.filter((l) => l.status === 'BROKEN');
  const successLinksRaw = filteredLinks.filter((l) => l.status === 'SUCCESS' && !l.isRechecked);
  const skippedLinksRaw = filteredLinks.filter((l) => l.status === 'SKIPPED' && !l.isRechecked);
  const recheckedLinksRaw = filteredLinks.filter((l) => l.isRechecked);
  const group = viewMode === 'url' ? groupLinks : groupLinksBySource;

  return {
    filteredLinks,
    uniqueFilteredLinks,
    brokenLinksRaw,
    successLinksRaw,
    skippedLinksRaw,
    recheckedLinksRaw,
    brokenLinks: groupLinks(brokenLinksRaw),
    successLinks: groupLinks(successLinksRaw),
    skippedLinks: groupLinks(skippedLinksRaw),
    recheckedLinks: groupLinks(recheckedLinksRaw),
    currentBrokenGroups: group(brokenLinksRaw),
    currentSuccessGroups: group(successLinksRaw),
    currentSkippedGroups: group(skippedLinksRaw),
    currentRecheckedGroups: group(recheckedLinksRaw),
    targetedGroups: uniqueFilteredLinks,
  };
}
