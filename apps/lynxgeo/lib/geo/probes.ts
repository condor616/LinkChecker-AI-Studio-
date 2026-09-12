import type { CrawlConfig } from '@lynx/crawler-core';
import { fetchGeoResource, type GeoCfConfig } from './cf-unlock';
import { geoStartPathPrefix } from './origin-scope';
import type { Finding } from './score';

export const AI_SEARCH_BOTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'PerplexityBot',
  'Bingbot',
  'Meta-ExternalAgent',
  'Amazonbot',
  'YouBot',
];
const GOOGLE_SEARCH_BOTS = ['Googlebot'];
export const TRAINING_BOTS = ['Google-Extended', 'CCBot', 'Bytespider', 'Applebot-Extended', 'Diffbot'];

function blockedByRobots(robotsTxt: string, bot: string): boolean {
  const escaped = bot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = robotsTxt.match(new RegExp(`User-agent:\\s*${escaped}[\\s\\S]*?(?=User-agent:|$)`, 'i'));
  if (!blocks) {
    const star = robotsTxt.match(/User-agent:\s*\*[\s\S]*?(?=User-agent:|$)/i);
    return !!star && /Disallow:\s*\//i.test(star[0]) && !/Allow:\s*\//i.test(star[0].split('Disallow')[0]);
  }
  return /Disallow:\s*\/\s*$/m.test(blocks[0]) || /Disallow:\s*\/\s*\n/i.test(blocks[0]);
}

/** Returns human-readable gaps when llms.txt is reachable but does not match llmstxt.org structure. */
export function llmsTxtStructureIssues(body: string): string[] {
  const issues: string[] = [];
  const lines = body.split(/\r?\n/);
  const hasH1 = lines.some((line) => /^#\s+\S/.test(line) && !line.startsWith('##'));
  if (!hasH1) issues.push('missing H1 (# title)');

  let hasLinkedSection = false;
  let inSection = false;
  let sectionHasLink = false;
  const linkRe = /\[[^\]]+\]\([^)]+\)/;
  for (const line of lines) {
    if (/^##\s+\S/.test(line)) {
      if (inSection && sectionHasLink) hasLinkedSection = true;
      inSection = true;
      sectionHasLink = false;
      continue;
    }
    if (/^#\s+\S/.test(line) && !line.startsWith('##')) {
      if (inSection && sectionHasLink) hasLinkedSection = true;
      inSection = false;
      sectionHasLink = false;
      continue;
    }
    if (inSection && linkRe.test(line)) sectionHasLink = true;
  }
  if (inSection && sectionHasLink) hasLinkedSection = true;
  if (!hasLinkedSection) issues.push('missing ## section with a markdown link');
  return issues;
}

/** True when either /.well-known/tdmrep.json is reachable or a tdm-reservation header is set. */
export function hasTdmRepSignal(wellKnownOk: boolean, tdmReservationHeader: string | undefined | null): boolean {
  return wellKnownOk || (tdmReservationHeader || '').trim().length > 0;
}

function uaBlockSnippet(robotsTxt: string, bot: string): string {
  const escaped = bot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = robotsTxt.match(new RegExp(`User-agent:\\s*${escaped}[\\s\\S]*?(?=User-agent:|$)`, 'i'));
  const star = robotsTxt.match(/User-agent:\s*\*[\s\S]*?(?=User-agent:|$)/i);
  const raw = (blocks?.[0] || star?.[0] || '(no matching User-agent block; default allow)').trim();
  const collapsed = raw.replace(/\s+/g, ' ');
  return collapsed.length > 280 ? `${collapsed.slice(0, 277)}...` : collapsed;
}

function probeObserved(resource: { statusCode: number | null; contentType?: string; error?: string | null }): string {
  const type = resource.contentType || 'n/a';
  const status = resource.statusCode ?? 'n/a';
  const err = resource.error ? ` (${resource.error})` : '';
  return `HTTP ${status}, Content-Type: ${type}${err}`;
}

/** Same-origin Sitemap: URLs from robots.txt (deduped, declaration order). */
export function parseRobotsSitemapUrls(robotsTxt: string, origin: string): string[] {
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of robotsTxt.split(/\r?\n/)) {
    const match = line.match(/^\s*Sitemap:\s*(\S+)/i);
    if (!match?.[1]) continue;
    try {
      const candidate = new URL(match[1]);
      if (candidate.origin !== originUrl.origin) continue;
      const href = candidate.toString();
      if (seen.has(href)) continue;
      seen.add(href);
      out.push(href);
    } catch {
      // ignore invalid Sitemap: values
    }
  }
  return out;
}

/** True when a probe response looks like a real sitemap / sitemap index (not HTML error pages). */
export function looksLikeSitemap(resource: {
  ok: boolean;
  contentType?: string;
  bodyText?: string | null;
}): boolean {
  if (!resource.ok) return false;
  const ct = (resource.contentType || '').toLowerCase();
  if (ct.includes('xml')) return true;
  const body = (resource.bodyText || '').trim();
  if (!body) return false;
  return /^<\?xml/i.test(body) || /<(urlset|sitemapindex)\b/i.test(body);
}

export type SitemapLastmodStats = {
  kind: 'urlset' | 'sitemapindex' | 'unknown';
  entryCount: number;
  withLastmod: number;
  /** Child sitemap locs from a sitemapindex (declaration order). */
  childLocs: string[];
};

/**
 * Parse <lastmod> coverage from a sitemap urlset or sitemapindex body.
 * Namespace-agnostic: matches local element names only.
 */
export function parseSitemapLastmod(body: string): SitemapLastmodStats {
  const text = body || '';
  const isIndex = /<sitemapindex\b/i.test(text);
  const isUrlset = /<urlset\b/i.test(text);
  if (isIndex) {
    const entries = [...text.matchAll(/<sitemap\b[\s\S]*?<\/sitemap>/gi)];
    let withLastmod = 0;
    const childLocs: string[] = [];
    for (const match of entries) {
      const chunk = match[0];
      if (/<lastmod\b[^>]*>\s*[^<\s][\s\S]*?<\/lastmod>/i.test(chunk)) withLastmod += 1;
      const loc = chunk.match(/<loc\b[^>]*>\s*([^<\s][^<]*)\s*<\/loc>/i)?.[1]?.trim();
      if (loc) childLocs.push(loc);
    }
    return { kind: 'sitemapindex', entryCount: entries.length, withLastmod, childLocs };
  }
  if (isUrlset) {
    const entries = [...text.matchAll(/<url\b[\s\S]*?<\/url>/gi)];
    let withLastmod = 0;
    for (const match of entries) {
      if (/<lastmod\b[^>]*>\s*[^<\s][\s\S]*?<\/lastmod>/i.test(match[0])) withLastmod += 1;
    }
    return { kind: 'urlset', entryCount: entries.length, withLastmod, childLocs: [] };
  }
  return { kind: 'unknown', entryCount: 0, withLastmod: 0, childLocs: [] };
}

/** Pass when at least half of entries carry <lastmod> (or all when there are few). */
export function sitemapLastmodCoverageOk(withLastmod: number, entryCount: number): boolean {
  if (entryCount <= 0) return false;
  if (entryCount <= 2) return withLastmod === entryCount;
  return withLastmod / entryCount >= 0.5;
}

/** True when an HTTP-date header value parses as a valid date. */
export function isParseableHttpDate(value: string | undefined | null): boolean {
  const raw = (value || '').trim();
  if (!raw) return false;
  const ms = Date.parse(raw);
  return !Number.isNaN(ms);
}

export async function runSiteProbes(
  origin: string,
  config: CrawlConfig,
  log: (line: string) => void = () => {},
  onPhase?: (phase: 'robots.txt' | 'sitemap', url: string) => void | Promise<void>,
  shouldContinue?: () => Promise<void>,
  auditId = 'probes',
  onConfigUpdate?: (next: GeoCfConfig) => void,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  let liveConfig: GeoCfConfig = { ...(config as GeoCfConfig), startUrl: origin, skipExternal: true };
  const probe = async (path: string, extra?: Record<string, string>) => {
    await shouldContinue?.();
    const url = new URL(path, origin).toString();
    log(`probe GET ${url}`);
    const unlocked = await fetchGeoResource(url, liveConfig, auditId, log, extra);
    liveConfig = unlocked.config;
    onConfigUpdate?.(liveConfig);
    return unlocked.resource;
  };

  const robotsUrl = new URL('/robots.txt', origin).toString();
  await onPhase?.('robots.txt', robotsUrl);
  const robots = await probe('/robots.txt');
  const robotsBody = robots.bodyText || '';
  if (!robots.ok || !robotsBody.trim()) {
    findings.push({
      id: 'robots-missing',
      category: 'crawlAccess',
      title: 'robots.txt missing or unreachable',
      detail: `${probeObserved(robots)} for ${robotsUrl}.`,
      severity: 'fail',
      standard: 'established',
      suggestion: `Publish a valid robots.txt at ${robotsUrl}. Keep public medical content crawlable for search bots.`,
      url: robotsUrl,
    });
  } else {
    findings.push({
      id: 'robots-present',
      category: 'crawlAccess',
      title: 'robots.txt is reachable',
      detail: `${probeObserved(robots)} for ${robotsUrl}.`,
      severity: 'pass',
      standard: 'established',
      suggestion: '',
      url: robotsUrl,
    });
    for (const bot of AI_SEARCH_BOTS) {
      const blocked = blockedByRobots(robotsBody, bot);
      findings.push({
        id: `bot-${bot}`,
        category: 'crawlAccess',
        title: blocked ? `${bot} is disallowed` : `${bot} is allowed`,
        detail: `${bot} is ${blocked ? 'DISALLOWED' : 'ALLOWED'} by robots.txt. Matching User-Agent block: ${uaBlockSnippet(robotsBody, bot)}`,
        severity: blocked ? 'fail' : 'pass',
        standard: 'established',
        suggestion: blocked
          ? `In ${robotsUrl}, allow ${bot} on public pages you want cited in AI search answers. Keep training bots blocked if that is policy.`
          : '',
        url: robotsUrl,
      });
    }
    for (const bot of GOOGLE_SEARCH_BOTS) {
      const blocked = blockedByRobots(robotsBody, bot);
      findings.push({
        id: `bot-${bot}`,
        category: 'crawlAccess',
        title: blocked ? `${bot} (Search) is disallowed` : `${bot} (Search) is allowed`,
        detail: `${bot} is ${blocked ? 'DISALLOWED' : 'ALLOWED'} by robots.txt. Googlebot is Search; Google-Extended is training and is scored separately. Matching User-Agent block: ${uaBlockSnippet(robotsBody, bot)}`,
        severity: blocked ? 'fail' : 'pass',
        standard: 'established',
        suggestion: blocked
          ? `In ${robotsUrl}, allow Googlebot if the page should appear in Google Search / AI Overviews based on Search.`
          : '',
        url: robotsUrl,
      });
    }
    for (const bot of TRAINING_BOTS) {
      const blocked = blockedByRobots(robotsBody, bot);
      findings.push({
        id: `train-${bot}`,
        category: 'crawlAccess',
        title: `${bot} (training) ${blocked ? 'blocked' : 'allowed'}`,
        detail: `${bot} is ${blocked ? 'BLOCKED' : 'ALLOWED'} by robots.txt (training bot). Reported separately from AI search bots. Matching User-Agent block: ${uaBlockSnippet(robotsBody, bot)}`,
        severity: 'pass',
        standard: 'established',
        suggestion: blocked ? '' : `Consider blocking ${bot} in ${robotsUrl} if you do not want content used for model training.`,
        url: robotsUrl,
      });
    }
  }

  const sitemapUrl = new URL('/sitemap.xml', origin).toString();
  await onPhase?.('sitemap', sitemapUrl);
  let sitemap = await probe('/sitemap.xml');
  let resolvedSitemapUrl = sitemapUrl;

  if (!looksLikeSitemap(sitemap) && robots.ok && robotsBody.trim()) {
    const candidates = parseRobotsSitemapUrls(robotsBody, origin)
      .filter((url) => url !== sitemapUrl)
      .slice(0, 3);
    for (const candidate of candidates) {
      await onPhase?.('sitemap', candidate);
      log(`probe GET ${candidate} (robots.txt Sitemap:)`);
      const unlocked = await fetchGeoResource(candidate, liveConfig, auditId, log);
      liveConfig = unlocked.config;
      onConfigUpdate?.(liveConfig);
      if (looksLikeSitemap(unlocked.resource)) {
        sitemap = unlocked.resource;
        resolvedSitemapUrl = candidate;
        break;
      }
    }
  }

  const sitemapOk = looksLikeSitemap(sitemap);
  findings.push({
    id: 'sitemap',
    category: 'crawlAccess',
    title: sitemapOk ? 'sitemap.xml found' : 'sitemap.xml missing',
    detail: `${probeObserved(sitemap)} for ${resolvedSitemapUrl}.`,
    severity: sitemapOk ? 'pass' : 'warn',
    standard: 'established',
    suggestion: sitemapOk
      ? ''
      : `Publish sitemap.xml (or a sitemap index) at ${sitemapUrl} so agents and search engines can discover URLs.`,
    url: resolvedSitemapUrl,
  });

  if (sitemapOk) {
    let lastmodStats = parseSitemapLastmod(sitemap.bodyText || '');
    let lastmodSourceUrl = resolvedSitemapUrl;
    let sampledChild = false;

    if (
      lastmodStats.kind === 'sitemapindex' &&
      !sitemapLastmodCoverageOk(lastmodStats.withLastmod, lastmodStats.entryCount) &&
      lastmodStats.childLocs.length > 0
    ) {
      const childUrl = lastmodStats.childLocs[0];
      try {
        const childOrigin = new URL(childUrl).origin;
        const siteOrigin = new URL(origin).origin;
        if (childOrigin === siteOrigin) {
          await shouldContinue?.();
          log(`probe GET ${childUrl} (sitemapindex lastmod sample, at most one)`);
          const unlocked = await fetchGeoResource(childUrl, liveConfig, auditId, log);
          liveConfig = unlocked.config;
          onConfigUpdate?.(liveConfig);
          sampledChild = true;
          if (looksLikeSitemap(unlocked.resource)) {
            const childStats = parseSitemapLastmod(unlocked.resource.bodyText || '');
            if (childStats.kind === 'urlset') {
              lastmodStats = childStats;
              lastmodSourceUrl = childUrl;
            }
          }
        }
      } catch {
        // invalid child URL — fall through with index stats
      }
    }

    if (lastmodStats.kind === 'unknown' || lastmodStats.entryCount === 0) {
      findings.push({
        id: 'sitemap-lastmod',
        category: 'citeability',
        title: 'Sitemap lastmod could not be verified',
        detail: `Sitemap at ${lastmodSourceUrl} did not expose countable <url> or <sitemap> entries with <lastmod>${sampledChild ? ' (after sampling one child)' : ''}.`,
        severity: 'warn',
        standard: 'established',
        suggestion: `Add <lastmod> timestamps to sitemap entries at ${resolvedSitemapUrl} so crawlers can assess freshness without article dates on living pages.`,
        url: lastmodSourceUrl,
      });
    } else {
      const ok = sitemapLastmodCoverageOk(lastmodStats.withLastmod, lastmodStats.entryCount);
      const kindLabel = lastmodStats.kind === 'urlset' ? 'urlset' : 'sitemapindex';
      findings.push({
        id: 'sitemap-lastmod',
        category: 'citeability',
        title: ok ? 'Sitemap lastmod present' : 'Sitemap lastmod sparse or missing',
        detail: `${kindLabel} at ${lastmodSourceUrl}: ${lastmodStats.withLastmod}/${lastmodStats.entryCount} entries have <lastmod>${sampledChild && lastmodSourceUrl !== resolvedSitemapUrl ? ` (sampled child of ${resolvedSitemapUrl})` : ''}.`,
        severity: ok ? 'pass' : 'warn',
        standard: 'established',
        suggestion: ok
          ? ''
          : `Add <lastmod> on most <url> (or <sitemap>) entries in ${resolvedSitemapUrl} so agents can use sitemap freshness for living pages.`,
        url: lastmodSourceUrl,
      });
    }
  }

  const llmsUrl = new URL('/llms.txt', origin).toString();
  const llms = await probe('/llms.txt');
  const llmsIssues = llms.ok ? llmsTxtStructureIssues(llms.bodyText || '') : [];
  const llmsStructured = llms.ok && llmsIssues.length === 0;
  findings.push({
    id: 'llms-txt',
    category: 'discovery',
    title: !llms.ok
      ? 'llms.txt not found'
      : llmsStructured
        ? 'llms.txt found'
        : 'llms.txt found but incomplete',
    detail: !llms.ok
      ? `${probeObserved(llms)} for ${llmsUrl}. Convention (llmstxt.org). Google Search ignores this file.`
      : llmsStructured
        ? `${probeObserved(llms)} for ${llmsUrl}. Structure looks valid (H1 + linked ## section). Convention (llmstxt.org).`
        : `${probeObserved(llms)} for ${llmsUrl}, but structure is incomplete: ${llmsIssues.join('; ')}. Convention (llmstxt.org).`,
    severity: llmsStructured ? 'pass' : 'warn',
    standard: 'convention',
    suggestion: !llms.ok
      ? `Optional: add ${llmsUrl} as an agent map of canonical pages. This does not affect Google rankings.`
      : llmsStructured
        ? ''
        : `Fix ${llmsUrl}: include an H1 title and at least one ## section with a markdown link [text](url).`,
    url: llmsUrl,
  });

  const llmsFullUrl = new URL('/llms-full.txt', origin).toString();
  const llmsFull = await probe('/llms-full.txt');
  findings.push({
    id: 'llms-full',
    category: 'discovery',
    title: llmsFull.ok ? 'llms-full.txt found' : 'llms-full.txt not found',
    detail: `${probeObserved(llmsFull)} for ${llmsFullUrl}. Optional companion file to llms.txt.`,
    severity: llmsFull.ok ? 'pass' : 'warn',
    standard: 'convention',
    suggestion: llmsFull.ok ? '' : `Optional: add ${llmsFullUrl} for a longer agent-readable digest.`,
    url: llmsFullUrl,
  });

  const mcpUrl = new URL('/.well-known/mcp.json', origin).toString();
  const mcp = await probe('/.well-known/mcp.json');
  findings.push({
    id: 'mcp-json',
    category: 'discovery',
    title: mcp.ok ? 'mcp.json found' : 'No /.well-known/mcp.json',
    detail: `${probeObserved(mcp)} for ${mcpUrl}. Emerging agent discovery file.`,
    severity: mcp.ok ? 'pass' : 'warn',
    standard: 'emerging',
    suggestion: mcp.ok
      ? ''
      : `Optional: publish ${mcpUrl} so agents can discover MCP endpoints for this origin. Emerging convention, not a ranking factor.`,
    url: mcpUrl,
  });

  const tdmrepUrl = new URL('/.well-known/tdmrep.json', origin).toString();
  const tdmrep = await probe('/.well-known/tdmrep.json');

  const homeUrl = new URL('/', origin).toString();
  const md = await probe('/', { Accept: 'text/markdown' });
  const isMarkdown = (md.contentType || '').includes('markdown');
  const varyHeader = md.headers['vary'] || '';
  const varyAccept = varyHeader.toLowerCase().includes('accept');
  const tdmHeader = (md.headers['tdm-reservation'] || '').trim();
  const hasTdmHeader = tdmHeader.length > 0;
  const hasTdmSignal = hasTdmRepSignal(tdmrep.ok, md.headers['tdm-reservation']);
  const tdmSignals: string[] = [];
  if (tdmrep.ok) tdmSignals.push(`/.well-known/tdmrep.json (${probeObserved(tdmrep)})`);
  if (hasTdmHeader) tdmSignals.push(`homepage tdm-reservation: ${tdmHeader}`);
  findings.push({
    id: 'tdmrep',
    category: 'discovery',
    title: hasTdmSignal ? 'TDMRep signal present' : 'No TDMRep signal',
    detail: hasTdmSignal
      ? `Observed TDM reservation via ${tdmSignals.join('; ')}.`
      : `No /.well-known/tdmrep.json (${probeObserved(tdmrep)}) and no tdm-reservation header on ${homeUrl}. Emerging TDMRep (W3C Community Group).`,
    severity: hasTdmSignal ? 'pass' : 'warn',
    standard: 'emerging',
    suggestion: hasTdmSignal
      ? ''
      : `Optional: publish ${tdmrepUrl} and/or send a tdm-reservation header so agents can discover text-and-data-mining consent. Emerging convention, not a ranking factor.`,
    url: tdmrepUrl,
  });
  findings.push({
    id: 'accept-markdown',
    category: 'negotiation',
    title: isMarkdown ? 'Serves Markdown for Accept: text/markdown' : 'Does not negotiate text/markdown',
    detail: `GET ${homeUrl} with Accept: text/markdown → ${probeObserved(md)}. Vary: ${varyHeader || 'none'}.`,
    severity: isMarkdown ? 'pass' : 'warn',
    standard: 'convention',
    suggestion: isMarkdown
      ? ''
      : `On ${homeUrl}, serve text/markdown when Accept prefers it (RFC 9110 / RFC 7763). Set Vary: Accept.`,
    url: homeUrl,
  });
  findings.push({
    id: 'vary-accept',
    category: 'negotiation',
    title: varyAccept ? 'Vary: Accept is set' : 'Vary: Accept missing',
    detail: `GET ${homeUrl} Accept: text/markdown → Vary: ${varyHeader || 'no Vary header'}. ${probeObserved(md)}.`,
    severity: isMarkdown && !varyAccept ? 'fail' : varyAccept ? 'pass' : 'warn',
    standard: 'established',
    suggestion: varyAccept ? '' : `Add Vary: Accept on ${homeUrl} so CDNs do not mix HTML and Markdown caches.`,
    url: homeUrl,
  });

  const lastModifiedHeader = md.headers['last-modified'] || '';
  const lastModifiedOk = isParseableHttpDate(lastModifiedHeader);
  const etag = (md.headers['etag'] || '').trim();
  const cacheControl = (md.headers['cache-control'] || '').trim();
  const altHints: string[] = [];
  if (etag) altHints.push(`ETag: ${etag}`);
  if (cacheControl) altHints.push(`Cache-Control: ${cacheControl}`);
  findings.push({
    id: 'http-last-modified',
    category: 'citeability',
    title: lastModifiedOk ? 'HTTP Last-Modified present' : 'HTTP Last-Modified missing',
    detail: lastModifiedOk
      ? `GET ${homeUrl} → Last-Modified: ${lastModifiedHeader}. ${probeObserved(md)}.${altHints.length ? ` Also ${altHints.join('; ')}.` : ''}`
      : `GET ${homeUrl} → no parseable Last-Modified header. ${probeObserved(md)}.${altHints.length ? ` Observed ${altHints.join('; ')} (caching validators; not a substitute for Last-Modified in this check).` : ''}`,
    severity: lastModifiedOk ? 'pass' : 'warn',
    standard: 'established',
    suggestion: lastModifiedOk
      ? ''
      : `Consider sending a Last-Modified header on ${homeUrl} so crawlers can assess homepage freshness. Many CDNs omit it in favor of ETag/Cache-Control — that is common, but Last-Modified remains a useful freshness signal.`,
    url: homeUrl,
  });

  findings.push({
    id: 'https-origin',
    category: 'citeability',
    title: origin.startsWith('https:') ? 'Origin is HTTPS' : 'Origin is not HTTPS',
    detail: origin,
    severity: origin.startsWith('https:') ? 'pass' : 'fail',
    standard: 'established',
    suggestion: origin.startsWith('https:') ? '' : `Serve the public site over HTTPS (${origin}).`,
    url: origin,
  });

  const pathPrefix = geoStartPathPrefix(config.startUrl || origin);
  if (pathPrefix !== '/') {
    const pathProbe = async (file: string, id: string, titleFound: string) => {
      await shouldContinue?.();
      const url = new URL(`${pathPrefix}${file}`, origin).toString();
      log(`probe GET ${url} (start-path, report only if present)`);
      const unlocked = await fetchGeoResource(url, liveConfig, auditId, log);
      liveConfig = unlocked.config;
      onConfigUpdate?.(liveConfig);
      const resource = unlocked.resource;
      if (!resource.ok || !(resource.bodyText || '').trim()) return;
      findings.push({
        id,
        category: file === 'robots.txt' ? 'crawlAccess' : 'discovery',
        title: titleFound,
        detail: `${probeObserved(resource)} for ${url}. Optional path-relative companion to the origin-root file.`,
        severity: 'pass',
        standard: 'convention',
        suggestion: '',
        url,
      });
    };
    await pathProbe('robots.txt', 'robots-start-path', `robots.txt found under ${pathPrefix}`);
    await pathProbe('llms.txt', 'llms-txt-start-path', `llms.txt found under ${pathPrefix}`);
    await pathProbe('llms-full.txt', 'llms-full-start-path', `llms-full.txt found under ${pathPrefix}`);
  }

  return findings;
}
