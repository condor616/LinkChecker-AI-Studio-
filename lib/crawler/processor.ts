import { getDb, db as centralDb } from '../db';
import { scans, links, users } from '../db/schema';
import { eq, and, or, inArray } from 'drizzle-orm';
import * as cheerio from 'cheerio';
import crypto from 'crypto';

const activeCrawls = new Map<string, Promise<void>>(); // Scan-scoped fetch cache

export async function processLink(userDb: any, link: any, scan: any, config: any) {

  // Re-check status before starting (in case it was paused during batch wait)
  const currentScan = await userDb.select().from(scans).where(eq(scans.id, scan.id)).then((res: any[]) => res[0]);
  if (!currentScan || currentScan.status !== 'RUNNING') return;

  const isTargeted = !!config.isTargeted && (config.targetUrls?.length > 0);
  const crawlKey = `${scan.id}:${link.url}`;

  // NEW: Wait if this URL is already being fetched in this scan
  if (activeCrawls.has(crawlKey)) {
    await activeCrawls.get(crawlKey);
    return;
  }

  let resolveCrawl: () => void;
  const crawlPromise = new Promise<void>((resolve) => { resolveCrawl = resolve; });
  activeCrawls.set(crawlKey, crawlPromise);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
    
    // HTTP Basic Auth
    const headers: Record<string, string> = { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    };
    if (config.auth && config.auth.username && config.auth.password) {
        const auth = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
    }

    // URL Deduplication check (for already COMPLETED links)
    const existing = await userDb.select().from(links)
      .where(and(
        eq(links.scanId, scan.id),
        eq(links.url, link.url),
        or(eq(links.status, 'SUCCESS'), eq(links.status, 'BROKEN'), eq(links.status, 'SKIPPED'))
      ))
      .limit(1)
      .then((res: any[]) => res[0]);

    if (existing) {
      await userDb.update(links).set({
        status: existing.status,
        statusCode: existing.statusCode,
        type: existing.type,
        error: existing.error,
        checkedAt: new Date(),
        snippet: `[Reused Result] ` + (link.snippet || '')
      }).where(and(eq(links.scanId, scan.id), eq(links.url, link.url), eq(links.status, 'PENDING')));
      return; // Stop here, no need to fetch or re-extract
    }

    const response = await fetch(link.url, {
      signal: controller.signal,
      headers
    });
    clearTimeout(timeoutId);

    const contentType = (response.headers.get('content-type') || '').split(';')[0];
    const status = response.ok ? 'SUCCESS' : 'BROKEN';
    const statusCode = response.status;
    
    // Bulk update all pending instances of this URL in this scan
    const updateData: any = {
      status,
      statusCode,
      type: contentType,
      checkedAt: new Date()
    };
    
    if (status === 'SUCCESS' && !isTargeted) {
        updateData.parentUrl = null; // Performance optimization for successful links
    }

    await userDb.update(links).set(updateData)
      .where(and(
        eq(links.scanId, scan.id),
        eq(links.url, link.url),
        eq(links.status, 'PENDING')
      ));

    // Recursive Extraction logic
    const maxDepth = config.maxDepth ?? 0;
    const currentDepth = link.depth || 0;

    const startUrlObj = new URL(config.startUrl);
    const currentUrlObj = new URL(link.url);
    const startHost = startUrlObj.hostname.toLowerCase().replace(/^www\./, '');
    const currentHost = currentUrlObj.hostname.toLowerCase().replace(/^www\./, '');
    
    // 1. Determine if Internal
    const isExactHost = currentHost === startHost;
    const isSubdomain = currentHost.endsWith('.' + startHost);
    const isInternal = isExactHost || isSubdomain;

    // 2. Traversal Rules (Check but don't traverse)
    let shouldTraverse = response.ok && contentType.includes('text/html') && (maxDepth === 0 || currentDepth < maxDepth);

    if (shouldTraverse) {
        // Rule: If skipExternal is enabled, do not traverse external links
        if (!isInternal && config.skipExternal !== false) { // Default to true if we want to be safe, but UI defaults to false. Let's use config.skipExternal explicitly.
            if (config.skipExternal) shouldTraverse = false;
        }

        // Rule: If excludeSubdomains is enabled, do not traverse subdomains
        if (isSubdomain && !isExactHost && config.excludeSubdomains) {
            shouldTraverse = false;
        }

        // Rule: If doNotTraverseBackward is enabled, check path
        if (config.doNotTraverseBackward) {
            const normalize = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
            const normalizedStart = normalize(config.startUrl);
            const normalizedCurrent = normalize(link.url);

            if (!normalizedCurrent.startsWith(normalizedStart)) {
                shouldTraverse = false;
            } else {
                const remaining = normalizedCurrent.slice(normalizedStart.length);
                if (remaining.length > 0 && !remaining.startsWith('/')) {
                    shouldTraverse = false;
                }
            }
        }

        // Rule: Regex/Wildcard Exclusions
        if (shouldExclude(link.url, config).excluded) {
            shouldTraverse = false;
        }
    }

    if (shouldTraverse) {
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // CSS Selector Skipping
      if (config.skipSelectors && Array.isArray(config.skipSelectors)) {
          config.skipSelectors.forEach((selector: string) => {
              if (selector.trim()) {
                  try {
                      $(selector.trim()).remove();
                  } catch (e) {
                      console.error(`Invalid selector: ${selector}`, e);
                  }
              }
          });
      }

      const foundLinks = new Map<string, { snippet: string }>();
      
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        
        try {
          const urlObj = new URL(href, link.url);
          if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
            urlObj.hash = '';
            const urlStr = urlObj.toString().replace(/\/$/, '');
            
            const snippet = $.html(el).slice(0, 500); 

            if (!foundLinks.has(urlStr)) {
                foundLinks.set(urlStr, { snippet });
            }
          }
        } catch (e) {}
      });

      const allUrls = Array.from(foundLinks.keys());
      if (allUrls.length === 0) return [];

      const existingLinks = await userDb.select({ 
        id: links.id,
        url: links.url, 
        parentUrl: links.parentUrl,
        status: links.status,
        statusCode: links.statusCode,
        error: links.error,
        type: links.type
      })
        .from(links)
        .where(and(eq(links.scanId, scan.id), inArray(links.url, allUrls)));
      
      const linksByUrl = new Map<string, any[]>();
      existingLinks.forEach((l: any) => {
          if (!linksByUrl.has(l.url)) linksByUrl.set(l.url, []);
          linksByUrl.get(l.url)!.push(l);
      });
      
      const targetUrls = (config.targetUrls || []).map((t: string) => t.trim().replace(/\/$/, ''));
      const newLinksToAdd: any[] = [];

      await userDb.transaction(async (tx: any) => {
        for (const [urlStr, info] of foundLinks) {
          if (isTargeted && !targetUrls.includes(urlStr)) continue;
          const occurrences = linksByUrl.get(urlStr) || [];

          if (isTargeted) {
              // Targeted Scan: Deduplicate by exact (url, parent) pair
              if (occurrences.some(o => o.parentUrl === link.url)) continue;
          } else {
              // Deduplication: Only skip inserting entirely if it's already recorded as SUCCESS.
              // If it's PENDING or BROKEN, we want to record the parent mapping, so we proceed to insert it.
              if (occurrences.some(o => o.status === 'SUCCESS')) continue;
          }

          const depthToAdd = currentDepth + 1;
          const finalLink: any = {
              id: crypto.randomUUID(),
              scanId: scan.id,
              url: urlStr,
              parentUrl: link.url,
              status: 'PENDING',
              depth: depthToAdd,
              snippet: info.snippet,
              checkedAt: null,
              statusCode: null,
              error: null,
              type: null
          };

          // If it was already known definitively elsewhere
          const definitive = occurrences.find(o => o.status === 'SUCCESS' || o.status === 'BROKEN');
          if (definitive) {
              finalLink.status = definitive.status;
              finalLink.statusCode = definitive.statusCode;
              finalLink.error = definitive.error;
              finalLink.type = definitive.type;
              finalLink.checkedAt = new Date();
              // Performance: If successful, it's just recorded once per crawl effectively for report
              // but we keep the parentUrl for reporting purposes if requested or useful
              // Actually, simplified logic: if already SUCCESS elsewhere, just record it.
          }

          await tx.insert(links).values(finalLink);
          if (finalLink.status === 'PENDING') {
              // Performance: Only fetch if we haven't already queued a fetch for this URL.
              // If `occurrences` has length > 0, it means another thread or earlier step already inserted
              // it as PENDING (or BROKEN which wouldn't reach here if it actually resolved, but we use `status === 'PENDING'` check anyway)
              if (occurrences.length === 0) {
                  newLinksToAdd.push(finalLink);
              }
          }
        }
      });

      return newLinksToAdd;
    }
    return [];

  } catch (error: any) {
    const errorMsg = error.name === 'AbortError' ? 'Timeout' : error.message;
    await userDb.update(links).set({
      status: 'BROKEN',
      error: errorMsg,
      checkedAt: new Date()
    }).where(and(eq(links.scanId, scan.id), eq(links.url, link.url), eq(links.status, 'PENDING')));
    return [];
  } finally {
    activeCrawls.delete(crawlKey);
    resolveCrawl!();
  }
}

function shouldExclude(urlStr: string, config: any): { excluded: boolean, reason?: string } {
    const normalizedUrl = urlStr.replace(/^https?:\/\/(www\.)?/, '');
    
    const sanitizePattern = (p: string) => {
        if (!p) return null;
        let cleaned = p.trim().replace(/^["']|["']$/g, '');
        if (cleaned.includes('\\\\')) cleaned = cleaned.replace(/\\\\/g, '\\');
        return cleaned;
    };

    try {
        const startUrlObj = new URL(config.startUrl);
        const currentUrlObj = new URL(urlStr);
        
        const startHost = startUrlObj.hostname.toLowerCase().replace(/^www\./, '');
        const currentHost = currentUrlObj.hostname.toLowerCase().replace(/^www\./, '');

    } catch (e) {}

    if (config.regexRules && Array.isArray(config.regexRules)) {
        for (const rule of config.regexRules) {
            const cleanRule = sanitizePattern(rule);
            if (!cleanRule) continue;
            try {
                const re = new RegExp(cleanRule);
                if (re.test(urlStr) || re.test(normalizedUrl)) {
                    return { excluded: true, reason: `Regex: ${cleanRule}` };
                }
            } catch (e) {}
        }
    }

    if (config.wildcardExclusions && Array.isArray(config.wildcardExclusions)) {
        for (const pattern of config.wildcardExclusions) {
            const cleanPattern = sanitizePattern(pattern);
            if (!cleanPattern) continue;
            try {
                const regexStr = cleanPattern
                    .replace(/[.+*?^${}()|[\]\\]/g, '\\$&') // ESCAPE ALL including * and ?
                    .replace(/\\\*/g, '.*')
                    .replace(/\\\?/g, '.');
                
                const re = new RegExp(regexStr); // Removed strict anchors for better wildcard flexibility
                if (re.test(urlStr) || re.test(normalizedUrl)) {
                    return { excluded: true, reason: `Wildcard: ${cleanPattern}` };
                }
            } catch (res: any) {}
        }
    }

    return { excluded: false };
}
