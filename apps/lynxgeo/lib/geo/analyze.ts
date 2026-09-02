import * as cheerio from 'cheerio';
import type { FetchedResource } from '@lynx/crawler-core';
import { isGeoHtmlPage } from './origin-scope';
import type { Finding } from './score';

function httpObserved(resource: FetchedResource): string {
  const type = resource.contentType || 'n/a';
  const status = resource.statusCode ?? 'n/a';
  return `HTTP ${status}, Content-Type: ${type}`;
}

export function analyzePage(resource: FetchedResource, html: string | null): Finding[] {
  const findings: Finding[] = [];
  const url = resource.url;

  if (resource.blockedBySsrf) {
    findings.push({
      id: `ssrf-${url}`,
      category: 'crawlAccess',
      title: 'URL blocked by SSRF policy',
      detail: `${httpObserved(resource)}. ${resource.error || 'Host is not fetchable from the auditor.'}`.trim(),
      severity: 'fail',
      standard: 'established',
      suggestion: `This host is not fetched from the auditor (${url}). Use staging Basic Auth for internal hosts instead of exposing them.`,
      url,
    });
    return findings;
  }

  if (!resource.ok) {
    findings.push({
      id: `http-${url}`,
      category: 'crawlAccess',
      title: `Page returned ${resource.statusCode}`,
      detail: `${httpObserved(resource)}${resource.error ? `. ${resource.error}` : ''}`,
      severity: resource.authGated ? 'warn' : 'fail',
      standard: 'established',
      suggestion: resource.authGated
        ? `Auth-gated page at ${url} is not treated as public AI-discoverable content.`
        : `Fix ${url} so agents and search can retrieve the page (observed ${httpObserved(resource)}).`,
      url,
    });
    return findings;
  }

  if (!isGeoHtmlPage(resource, html)) {
    return findings;
  }

  const $ = cheerio.load(html || resource.bodyText || '');
  const title = $('title').first().text().trim();
  const canonical = $('link[rel="canonical"]').attr('href');
  const lang = $('html').attr('lang');
  const hreflang = $('link[rel="alternate"][hreflang]').length;
  const h1 = $('h1').length;
  const jsonLd = $('script[type="application/ld+json"]').length;
  const robotsMeta = ($('meta[name="robots"]').attr('content') || '').toLowerCase();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const cookieWall = /(accept cookies|enable javascript|please enable js|consent)/i.test(bodyText.slice(0, 1500)) && bodyText.length < 800;

  if (robotsMeta.includes('noindex')) {
    findings.push({
      id: `noindex-${url}`,
      category: 'crawlAccess',
      title: 'Page is noindex',
      detail: `Observed <meta name="robots" content="${robotsMeta}"> on ${url}.`,
      severity: 'fail',
      standard: 'established',
      suggestion: `Remove noindex on ${url} if this page should appear in AI search features.`,
      url,
    });
  }

  findings.push({
    id: `title-${url}`,
    category: 'citeability',
    title: title ? 'Title is present' : 'Missing title',
    detail: title ? `<title>${title}</title>` : `No <title> element in the HTML of ${url}.`,
    severity: title ? 'pass' : 'fail',
    standard: 'established',
    suggestion: title ? '' : `Add a unique, descriptive <title> on ${url}.`,
    url,
  });

  findings.push({
    id: `h1-${url}`,
    category: 'extractability',
    title: h1 ? 'Heading structure includes H1' : 'No H1',
    detail: `Observed ${h1} <h1> element(s) on ${url}.`,
    severity: h1 ? 'pass' : 'warn',
    standard: 'established',
    suggestion: h1 ? '' : `Add a single clear <h1> on ${url} that matches the page topic.`,
    url,
  });

  findings.push({
    id: `canonical-${url}`,
    category: 'extractability',
    title: canonical ? 'Canonical link present' : 'No canonical',
    detail: canonical ? `rel=canonical href="${canonical}"` : `No <link rel="canonical"> on ${url}.`,
    severity: canonical ? 'pass' : 'warn',
    standard: 'established',
    suggestion: canonical ? '' : `Add <link rel="canonical" href="..."> on ${url} to reduce duplicate URL confusion.`,
    url,
  });

  findings.push({
    id: `lang-${url}`,
    category: 'extractability',
    title: lang ? `html lang=${lang}` : 'Missing html lang',
    detail: lang ? `<html lang="${lang}">` : `No html lang attribute on ${url}.`,
    severity: lang ? 'pass' : 'warn',
    standard: 'established',
    suggestion: lang ? '' : `Set html lang on ${url} (and hreflang on locale variants) for Novartis country sites.`,
    url,
  });

  if (hreflang === 0 && (url.includes('/en') || url.includes('/de') || url.includes('/fr'))) {
    findings.push({
      id: `hreflang-${url}`,
      category: 'extractability',
      title: 'No hreflang alternates on a locale-looking URL',
      detail: `URL looks locale-specific (${url}) but no <link rel="alternate" hreflang> tags were found.`,
      severity: 'warn',
      standard: 'established',
      suggestion: `Add hreflang alternates on ${url} for language/country variants.`,
      url,
    });
  }

  findings.push({
    id: `jsonld-${url}`,
    category: 'extractability',
    title: jsonLd ? 'JSON-LD present' : 'No JSON-LD',
    detail: jsonLd
      ? `${jsonLd} <script type="application/ld+json"> block(s) on ${url}. Schema.org type validation is phase 2 (official schema.org vocabulary, not homemade rules).`
      : `No <script type="application/ld+json"> on ${url}. Schema.org type validation is phase 2.`,
    severity: jsonLd ? 'pass' : 'warn',
    standard: 'established',
    suggestion: jsonLd ? '' : `Add JSON-LD on ${url} (Organization / WebPage / MedicalWebPage where relevant). Type/vocabulary checks are phase 2.`,
    url,
  });

  const mdAlt = $('link[rel="alternate"][type="text/markdown"], link[rel="alternate"][type="text/x-markdown"]').length;
  findings.push({
    id: `md-alt-${url}`,
    category: 'negotiation',
    title: mdAlt ? 'Markdown alternate link present' : 'No markdown rel=alternate',
    detail: mdAlt
      ? `${mdAlt} rel=alternate markdown link(s) on ${url}.`
      : `No <link rel="alternate" type="text/markdown"> (or text/x-markdown) on ${url}.`,
    severity: mdAlt ? 'pass' : 'warn',
    standard: 'convention',
    suggestion: mdAlt ? '' : `Optionally advertise a markdown representation on ${url} via rel=alternate type="text/markdown".`,
    url,
  });

  if (cookieWall) {
    findings.push({
      id: `wall-${url}`,
      category: 'crawlAccess',
      title: 'Possible consent / JS wall',
      detail: `Thin HTML body (${bodyText.length} characters) with cookie or JavaScript messaging on ${url}.`,
      severity: 'fail',
      standard: 'established',
      suggestion: `Ensure main content is in the HTML response for ${url}, not only behind a consent or JS shell.`,
      url,
    });
  }

  const timeCount = $('time').length;
  const published = $('meta[property="article:published_time"]').attr('content');
  const modified = $('meta[property="article:modified_time"]').attr('content');
  const metaDate = $('meta[name="date"]').attr('content');
  const dateSignals: string[] = [];
  if (timeCount) dateSignals.push(`<time> (${timeCount})`);
  if (published) dateSignals.push(`article:published_time="${published}"`);
  if (modified) dateSignals.push(`article:modified_time="${modified}"`);
  if (metaDate) dateSignals.push(`meta name="date" content="${metaDate}"`);
  const hasDate = dateSignals.length > 0;
  findings.push({
    id: `date-${url}`,
    category: 'citeability',
    title: hasDate ? 'Date markup present' : 'No visible date markup',
    detail: hasDate
      ? `Observed ${dateSignals.join(', ')} on ${url}.`
      : `Checked <time>, meta property="article:published_time", meta property="article:modified_time", and meta name="date" on ${url} — none present.`,
    severity: hasDate ? 'pass' : 'warn',
    standard: 'established',
    suggestion: hasDate
      ? ''
      : `On ${url}, add a visible <time datetime="..."> and/or <meta property="article:published_time"> so answers can cite freshness.`,
    url,
  });

  findings.push({
    id: `https-${url}`,
    category: 'citeability',
    title: url.startsWith('https:') ? 'Page served over HTTPS' : 'Page is not HTTPS',
    detail: url,
    severity: url.startsWith('https:') ? 'pass' : 'fail',
    standard: 'established',
    suggestion: url.startsWith('https:') ? '' : `Redirect ${url} from HTTP to HTTPS.`,
    url,
  });

  const htmlBytes = (html || '').length;
  if (htmlBytes > 1_500_000) {
    findings.push({
      id: `size-${url}`,
      category: 'citeability',
      title: 'Very large HTML document',
      detail: `${htmlBytes} bytes HTML on ${url}. ${httpObserved(resource)}.`,
      severity: 'warn',
      standard: 'established',
      suggestion: `Large pages cost tokens for agents. Prefer lean main content on ${url}.`,
      url,
    });
  }

  return findings;
}
