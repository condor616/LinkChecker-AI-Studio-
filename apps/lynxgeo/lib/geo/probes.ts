import type { CrawlConfig } from '@lynx/crawler-core';
import { fetchResource } from '@lynx/crawler-core';
import { geoStartPathPrefix } from './origin-scope';
import type { Finding } from './score';

const AI_SEARCH_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot'];
const GOOGLE_SEARCH_BOTS = ['Googlebot'];
const TRAINING_BOTS = ['Google-Extended', 'CCBot', 'Bytespider'];

function blockedByRobots(robotsTxt: string, bot: string): boolean {
  const blocks = robotsTxt.match(new RegExp(`User-agent:\\s*${bot}[\\s\\S]*?(?=User-agent:|$)`, 'i'));
  if (!blocks) {
    const star = robotsTxt.match(/User-agent:\s*\*[\s\S]*?(?=User-agent:|$)/i);
    return !!star && /Disallow:\s*\//i.test(star[0]) && !/Allow:\s*\//i.test(star[0].split('Disallow')[0]);
  }
  return /Disallow:\s*\/\s*$/m.test(blocks[0]) || /Disallow:\s*\/\s*\n/i.test(blocks[0]);
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

export async function runSiteProbes(
  origin: string,
  config: CrawlConfig,
  log: (line: string) => void = () => {},
  onPhase?: (phase: 'robots.txt' | 'sitemap', url: string) => void | Promise<void>,
  shouldContinue?: () => Promise<void>,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const probe = async (path: string, extra?: Record<string, string>) => {
    await shouldContinue?.();
    const url = new URL(path, origin).toString();
    log(`probe GET ${url}`);
    return fetchResource(url, { ...config, startUrl: origin, skipExternal: true }, extra);
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
  const sitemap = await probe('/sitemap.xml');
  findings.push({
    id: 'sitemap',
    category: 'crawlAccess',
    title: sitemap.ok ? 'sitemap.xml found' : 'sitemap.xml missing',
    detail: `${probeObserved(sitemap)} for ${sitemapUrl}.`,
    severity: sitemap.ok ? 'pass' : 'warn',
    standard: 'established',
    suggestion: sitemap.ok ? '' : `Publish sitemap.xml (or a sitemap index) at ${sitemapUrl} so agents and search engines can discover URLs.`,
    url: sitemapUrl,
  });

  const llmsUrl = new URL('/llms.txt', origin).toString();
  const llms = await probe('/llms.txt');
  findings.push({
    id: 'llms-txt',
    category: 'discovery',
    title: llms.ok ? 'llms.txt found' : 'llms.txt not found',
    detail: `${probeObserved(llms)} for ${llmsUrl}. Convention (llmstxt.org). Google Search ignores this file.`,
    severity: llms.ok ? 'pass' : 'warn',
    standard: 'convention',
    suggestion: llms.ok
      ? ''
      : `Optional: add ${llmsUrl} as an agent map of canonical pages. This does not affect Google rankings.`,
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

  const homeUrl = new URL('/', origin).toString();
  const md = await probe('/', { Accept: 'text/markdown' });
  const isMarkdown = (md.contentType || '').includes('markdown');
  const varyHeader = md.headers['vary'] || '';
  const varyAccept = varyHeader.toLowerCase().includes('accept');
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
      const resource = await fetchResource(url, { ...config, startUrl: origin, skipExternal: true });
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
