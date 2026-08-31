import type { CrawlConfig } from './types';
import { isWithinStartPathScope } from './url';

export function shouldExclude(urlStr: string, config: CrawlConfig | any): { excluded: boolean; reason?: string } {
  const normalizedUrl = urlStr.replace(/^https?:\/\/(www\.)?/, '');

  const sanitizePattern = (p: string) => {
    if (!p) return null;
    let cleaned = p.trim().replace(/^["']|["']$/g, '');
    if (cleaned.includes('\\\\')) cleaned = cleaned.replace(/\\\\/g, '\\');
    return cleaned;
  };

  if (config.excludeRegex) {
    const cleanRule = sanitizePattern(config.excludeRegex);
    if (cleanRule) {
      try {
        const re = new RegExp(cleanRule, 'i');
        if (re.test(urlStr) || re.test(normalizedUrl)) {
          return { excluded: true, reason: `Legacy Regex Rule: ${cleanRule}` };
        }
      } catch {}
    }
  }

  if (config.regexRules && Array.isArray(config.regexRules)) {
    for (const rule of config.regexRules) {
      const cleanRule = sanitizePattern(rule);
      if (!cleanRule) continue;
      try {
        const re = new RegExp(cleanRule, 'i');
        if (re.test(urlStr) || re.test(normalizedUrl)) {
          return { excluded: true, reason: `Regex Rule: ${cleanRule}` };
        }
      } catch {}
    }
  }

  if (config.wildcardExclusions && Array.isArray(config.wildcardExclusions)) {
    for (const pattern of config.wildcardExclusions) {
      const cleanPattern = sanitizePattern(pattern);
      if (!cleanPattern) continue;
      try {
        const regexStr = cleanPattern
          .replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
          .replace(/\\\*/g, '.*')
          .replace(/\\\?/g, '.');

        const re = new RegExp(regexStr, 'i');
        if (re.test(urlStr) || re.test(normalizedUrl)) {
          return { excluded: true, reason: `Wildcard Rule: ${cleanPattern}` };
        }
      } catch {}
    }
  }

  return { excluded: false };
}

export function getSkipReason(urlStr: string, config: CrawlConfig | any): string | null {
  try {
    const exclusion = shouldExclude(urlStr, config);
    if (exclusion.excluded) {
      return exclusion.reason || 'Matches exclusion rule';
    }
  } catch (e: any) {
    return `Invalid URL format: ${e.message}`;
  }

  return null;
}

export function getTraversalSkipReason(urlStr: string, config: CrawlConfig | any, status: string): string | null {
  if (status !== 'SUCCESS') return null;

  try {
    const startUrlObj = new URL(config.startUrl);
    const currentUrlObj = new URL(urlStr);
    const startHost = startUrlObj.hostname.toLowerCase().replace(/^www\./, '');
    const currentHost = currentUrlObj.hostname.toLowerCase().replace(/^www\./, '');
    const isExactHost = currentHost === startHost;
    const isSubdomain = currentHost.endsWith('.' + startHost);
    const isInternal = isExactHost || isSubdomain;

    if (!isInternal && config.skipExternal) {
      return 'External link (Verified)';
    }
    if (isSubdomain && !isExactHost && config.excludeSubdomains) {
      return 'Subdomain excluded (Verified)';
    }
    if (config.doNotTraverseBackward && !isWithinStartPathScope(config.startUrl, urlStr)) {
      return 'Stay in Subpath (Verified)';
    }
  } catch {
    return null;
  }

  return null;
}

export { isWithinStartPathScope };
