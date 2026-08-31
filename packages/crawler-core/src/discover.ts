import * as cheerio from 'cheerio';
import type { CrawlConfig, DiscoveredLink } from './types';
import { canonicalizeHref, canonicalizeScanUrl, extractFragmentId, getUrlWithoutHash, isTargetUrlMatch } from './url';

const MAX_FORM_FILTER_URLS = 100;

export function applySkipSelectors($: cheerio.CheerioAPI, skipSelectors?: string[]) {
  if (!skipSelectors || !Array.isArray(skipSelectors)) return;
  skipSelectors.forEach((selector: string) => {
    if (selector.trim()) {
      try {
        $(selector.trim()).remove();
      } catch (e) {
        console.error(`Invalid selector: ${selector}`, e);
      }
    }
  });
}

function findFragmentContainer($: cheerio.CheerioAPI, fragmentId: string) {
  const escaped = fragmentId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const byId = $(`[id="${escaped}"]`).first();
  if (byId.length) return byId;
  const byName = $(`[name="${escaped}"]`).first();
  return byName.length ? byName : null;
}

export function extractGetFormFilterUrls($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  $('form').each((_, formEl) => {
    if (urls.length >= MAX_FORM_FILTER_URLS) return;
    const $form = $(formEl);
    const method = ($form.attr('method') || 'get').trim().toLowerCase();
    if (method && method !== 'get') return;

    const action = $form.attr('action') ?? '';
    let actionUrl: URL;
    try {
      actionUrl = new URL(action || '.', baseUrl);
    } catch {
      return;
    }
    if (actionUrl.protocol !== 'http:' && actionUrl.protocol !== 'https:') return;

    const defaults = new URLSearchParams();
    $form.find('input[type="hidden"][name]').each((__, input) => {
      const name = $(input).attr('name');
      if (!name) return;
      defaults.append(name, $(input).attr('value') ?? '');
    });
    $form.find('select[name]').each((__, select) => {
      const name = $(select).attr('name');
      if (!name) return;
      const selected = $(select).find('option[selected]').first();
      const fallback = $(select).find('option[value]').first();
      const option = selected.length ? selected : fallback;
      if (!option.length) return;
      defaults.append(name, option.attr('value') ?? '');
    });
    $form.find('input[type="radio"][name][checked]').each((__, input) => {
      const name = $(input).attr('name');
      if (!name) return;
      defaults.append(name, $(input).attr('value') ?? '');
    });

    const record = (params: URLSearchParams) => {
      if (urls.length >= MAX_FORM_FILTER_URLS) return;
      const candidate = new URL(actionUrl.toString());
      candidate.search = '';
      params.forEach((value, name) => {
        if (value === '') return;
        candidate.searchParams.append(name, value);
      });
      const canonical = canonicalizeScanUrl(candidate.toString());
      if (!canonical || seen.has(canonical)) return;
      seen.add(canonical);
      urls.push(canonical);
    };

    record(new URLSearchParams(defaults));

    $form.find('select[name]').each((__, select) => {
      const name = $(select).attr('name');
      if (!name) return;
      $(select).find('option').each((___, option) => {
        const value = $(option).attr('value');
        if (value === undefined || value === '') return;
        const params = new URLSearchParams(defaults);
        params.delete(name);
        params.append(name, value);
        record(params);
      });
    });

    $form.find('input[type="radio"][name]').each((__, input) => {
      const name = $(input).attr('name');
      if (!name) return;
      const value = $(input).attr('value');
      if (value === undefined || value === '') return;
      const params = new URLSearchParams(defaults);
      params.delete(name);
      params.append(name, value);
      record(params);
    });
  });

  return urls;
}

export function discoverLinks(html: string, pageUrl: string, config: CrawlConfig, currentDepth: number): DiscoveredLink[] {
  const $ = cheerio.load(html);
  applySkipSelectors($, config.skipSelectors);

  const foundLinks = new Map<string, DiscoveredLink>();
  const recordFoundLink = (url: string, parentUrl: string, snippet: string, depth = currentDepth + 1) => {
    const key = `${parentUrl}\n${url}`;
    if (!foundLinks.has(key)) {
      foundLinks.set(key, { url, parentUrl, snippet, depth });
    }
  };

  $('a[href], area[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.trim() === '' || href.trim() === '#') return;
    const urlStr = canonicalizeHref(href, pageUrl);
    if (!urlStr) return;
    recordFoundLink(urlStr, pageUrl, $.html(el).slice(0, 500));
  });

  $('link[href]').each((_, el) => {
    const rel = ($(el).attr('rel') || '').toLowerCase().split(/\s+/);
    if (!rel.includes('next') && !rel.includes('prev')) return;
    const href = $(el).attr('href');
    if (!href || href.trim() === '' || href.trim() === '#') return;
    const urlStr = canonicalizeHref(href, pageUrl);
    if (!urlStr) return;
    recordFoundLink(urlStr, pageUrl, $.html(el).slice(0, 500));
  });

  extractGetFormFilterUrls($, pageUrl).forEach((formUrl) => {
    recordFoundLink(formUrl, pageUrl, '[GET form filter]');
  });

  const currentDocumentUrl = getUrlWithoutHash(pageUrl);
  const isTargeted = !!config.isTargeted && (config.targetUrls?.length || 0) > 0;
  const targetUrlsCanonical = ((config.targetUrls || []) as string[]).map((t) => canonicalizeScanUrl(t));
  const fragmentUrlsToScan = new Set<string>();

  for (const found of foundLinks.values()) {
    if (getUrlWithoutHash(found.url) === currentDocumentUrl && extractFragmentId(found.url)) {
      fragmentUrlsToScan.add(found.url);
    }
  }
  for (const target of targetUrlsCanonical) {
    if (getUrlWithoutHash(target) === currentDocumentUrl && extractFragmentId(target)) {
      fragmentUrlsToScan.add(target);
    }
  }

  for (const fragmentUrl of fragmentUrlsToScan) {
    const fragmentId = extractFragmentId(fragmentUrl);
    if (!fragmentId) continue;
    const container = findFragmentContainer($, fragmentId);
    if (!container) continue;

    const isFragmentTarget = isTargeted && targetUrlsCanonical.some((target) => isTargetUrlMatch(fragmentUrl, target));
    if (isFragmentTarget) {
      recordFoundLink(fragmentUrl, pageUrl, container.html()?.slice(0, 500) || '');
    }

    container.find('a[href]').each((_, nestedEl) => {
      const nestedHref = $(nestedEl).attr('href');
      if (!nestedHref) return;
      const nestedUrl = canonicalizeHref(nestedHref, pageUrl);
      if (!nestedUrl) return;
      recordFoundLink(nestedUrl, fragmentUrl, $.html(nestedEl).slice(0, 500));
    });
  }

  return Array.from(foundLinks.values());
}
