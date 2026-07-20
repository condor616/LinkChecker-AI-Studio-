import { getDb, db as centralDb } from '../db';
import { scans, links, users } from '../db/schema';
import { eq, and, or, inArray, sql } from 'drizzle-orm';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const activeCrawls = new Map<string, Promise<void>>(); // Scan-scoped fetch cache
const hostSafetyCache = new Map<string, boolean>();

function normalizeHostname(hostname: string): string {
    return hostname.toLowerCase().replace(/^www\./, '');
}

function isSameOrSubdomain(hostname: string, rootHostname: string): boolean {
    return hostname === rootHostname || hostname.endsWith(`.${rootHostname}`);
}

function looksLikeAuthPath(url: string): boolean {
    const lower = url.toLowerCase();
    return /(\/|^)(login|log-in|signin|sign-in|auth|oauth|sso)(\/|\?|#|$)/.test(lower);
}

function isAuthGatedResponse(response: Response, requestUrl: string, bodyPreview: string): boolean {
    if (response.status !== 401 && response.status !== 403) {
        return false;
    }

    const authHeader = (response.headers.get('www-authenticate') || '').toLowerCase();
    if (authHeader) {
        return true;
    }

    const location = (response.headers.get('location') || '').toLowerCase();
    if (location && /(login|signin|sign-in|auth|oauth|sso)/.test(location)) {
        return true;
    }

    const finalUrl = (response.url || requestUrl || '').toLowerCase();
    if (finalUrl && looksLikeAuthPath(finalUrl)) {
        return true;
    }

    const body = bodyPreview.toLowerCase();
    return /(unauthorized|forbidden|access denied|authentication required|please log in|please login|log in to continue|sign in to continue|single sign-on|\bsso\b|invalid credentials|bad credentials)/.test(body);
}

async function fetchWithRedirects(
    inputUrl: string,
    headers: Record<string, string>,
    signal: AbortSignal,
    maxRedirects = 5,
): Promise<Response> {
    let currentUrl = inputUrl;

    for (let i = 0; i <= maxRedirects; i++) {
        const response = await fetch(currentUrl, {
            signal,
            headers,
            redirect: 'manual',
        });

        if (response.status < 300 || response.status >= 400) {
            return response;
        }

        const location = response.headers.get('location');
        if (!location) {
            return response;
        }

        currentUrl = new URL(location, currentUrl).toString();
    }

    throw new Error(`Too many redirects for ${inputUrl}`);
}

function isPrivateIpAddress(address: string): boolean {
    if (address === '::1') return true;

    if (address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) {
        return true;
    }

    const parts = address.split('.').map((part) => Number.parseInt(part, 10));
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;

    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;

    return false;
}

async function isSafeHostname(hostname: string): Promise<boolean> {
    const normalized = hostname.toLowerCase();

    if (hostSafetyCache.has(normalized)) {
        return hostSafetyCache.get(normalized)!;
    }

    if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
        hostSafetyCache.set(normalized, false);
        return false;
    }

    if (isIP(normalized) && isPrivateIpAddress(normalized)) {
        hostSafetyCache.set(normalized, false);
        return false;
    }

    try {
        const results = await lookup(normalized, { all: true, verbatim: true });
        const isSafe = results.every((result) => !isPrivateIpAddress(result.address));
        hostSafetyCache.set(normalized, isSafe);
        return isSafe;
    } catch {
        // If DNS lookup fails, allow normal fetch handling to determine status.
        hostSafetyCache.set(normalized, true);
        return true;
    }
}

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
        const currentTarget = new URL(link.url);
      const scanRootHost = normalizeHostname(new URL(config.startUrl).hostname);
        const targetHost = normalizeHostname(currentTarget.hostname);
      const isWithinStartHostScope = isSameOrSubdomain(targetHost, scanRootHost);
        const isSafeTarget = await isSafeHostname(currentTarget.hostname);
        if (!isSafeTarget && !isWithinStartHostScope) {
            await userDb.update(links).set({
                status: 'SKIPPED',
                statusCode: null,
                type: null,
                checkedAt: new Date(),
                error: 'Blocked by SSRF protection policy'
            }).where(and(
                eq(links.scanId, scan.id),
                eq(links.url, link.url),
                or(eq(links.status, 'PENDING'), eq(links.status, 'PROCESSING'))
            ));
            return;
        }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
    
    // HTTP Basic Auth
    let userAgent = config.customUserAgent || config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    // Implement Random Delay if configured
    if (config.randomDelay && config.randomDelay > 0) {
        const delay = Math.floor(Math.random() * config.randomDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    const headers: Record<string, string> = { 
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'sec-fetch-dest': 'document',
    };
    if (config.auth && config.auth.username && config.auth.password) {
        const auth = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
    }


    // Single Crawl Guarantee: Handle PENDING or already checked results
    const existingRaw = await userDb.select().from(links)
      .where(and(
        eq(links.scanId, scan.id),
        eq(links.url, link.url)
      ));

    const checkComplete = existingRaw.find((l: any) => l.status === 'SUCCESS' || l.status === 'BROKEN' || l.status === 'SKIPPED');
    if (checkComplete) {
      await userDb.update(links).set({
        status: checkComplete.status,
        statusCode: checkComplete.statusCode,
        type: checkComplete.type,
        error: checkComplete.error,
        checkedAt: new Date(),
        snippet: `[Reused Result] ` + (link.snippet || '')
      }).where(and(
        eq(links.scanId, scan.id), 
        eq(links.url, link.url), 
        or(eq(links.status, 'PENDING'), eq(links.status, 'PROCESSING'))
      ));
      return; 
    }

        let response = await fetchWithRedirects(link.url, headers, controller.signal);

    // Smart Retry: If blocked (403/400/429), try with Minimalist headers
    if (!response.ok && (response.status === 403 || response.status === 400 || response.status === 429)) {
        console.log(`[Smart Retry] Detected ${response.status} for ${link.url}. Retrying with minimalist headers...`);
        const fallbackHeaders: Record<string, string> = {
            'User-Agent': 'curl/8.17.0',
            'Accept': '*/*',
            'sec-fetch-mode': 'navigate'
        };
        // Preserve auth if present
        if (headers['Authorization']) fallbackHeaders['Authorization'] = headers['Authorization'];
        
        const retryResponse = await fetchWithRedirects(link.url, fallbackHeaders, controller.signal);
        if (retryResponse.ok || (retryResponse.status !== 403 && retryResponse.status !== 400)) {
            response = retryResponse;
        }
    }

    clearTimeout(timeoutId);

    const contentType = (response.headers.get('content-type') || '').split(';')[0];
    let status = response.ok ? 'SUCCESS' : 'BROKEN';
    const statusCode = response.status;


    // Evaluate Traversal Rules before finalizing status
    const startUrlObj = new URL(config.startUrl);
    const currentUrlObj = new URL(link.url);
    const startHost = startUrlObj.hostname.toLowerCase().replace(/^www\./, '');
    const currentHost = currentUrlObj.hostname.toLowerCase().replace(/^www\./, '');
    
    const isExactHost = currentHost === startHost;
    const isSubdomain = currentHost.endsWith('.' + startHost);
    const isInternal = isExactHost || isSubdomain;

    let skipReason: string | null = null;
    if (status === 'SUCCESS') {
        if (!isInternal && config.skipExternal) {
            skipReason = `External link (Verified)`;
        } else if (isSubdomain && !isExactHost && config.excludeSubdomains) {
            skipReason = `Subdomain excluded (Verified)`;
        } else if (config.doNotTraverseBackward) {
            const normalize = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
            const normalizedStart = normalize(config.startUrl);
            const normalizedCurrent = normalize(link.url);

            if (!normalizedCurrent.startsWith(normalizedStart)) {
                skipReason = `Stay in Subpath (Verified)`;
            } else {
                const remaining = normalizedCurrent.slice(normalizedStart.length);
                if (remaining.length > 0 && !remaining.startsWith('/')) {
                    skipReason = `Stay in Subpath (Verified)`;
                }
            }
        }
    }

    if (skipReason) {
        // Verified links should retain their real HTTP outcome (SUCCESS/BROKEN).
        // skipReason here only controls traversal, not triage status.
        console.log(`[Info] ${link.url} traversal disabled after verification: ${skipReason}`);
    }

    let errorDetail = skipReason;
    let errorBodyPreview = '';
    if (!response.ok) {
        try {
            if (contentType.includes('text') || contentType.includes('json') || contentType.includes('xml')) {
                const text = await response.text();
                errorBodyPreview = text.slice(0, 1000);
                errorDetail = `[Response] ${text.slice(0, 500)}`;
            } else {
                errorDetail = `[Status] ${response.statusText || 'Error'}`;
            }
        } catch (e) {
            errorDetail = `[Status] ${response.statusText || 'Error'}`;
        }

        if (isAuthGatedResponse(response, link.url, errorBodyPreview)) {
            status = 'SKIPPED';
            if (!skipReason) {
                errorDetail = `Auth-gated resource (${response.status}) - not treated as broken`;
            }
        }
    }

    // Bulk update all pending instances of this URL in this scan
    const updateData: any = {
      status,
      statusCode,
      type: contentType,
      checkedAt: new Date(),
      error: errorDetail
    };
    
    if (status === 'SUCCESS' && !isTargeted) {
        updateData.parentUrl = null; // Performance optimization for successful links
    }

    await userDb.update(links).set(updateData)
      .where(and(
        eq(links.scanId, scan.id),
        eq(links.url, link.url),
        or(eq(links.status, 'PENDING'), eq(links.status, 'PROCESSING'))
      ));

    // Post-Process Cleanup for Success: Remove duplicates for healthy links
    if (status === 'SUCCESS' && !isTargeted) {
        const healthyLinks = await userDb.select({ id: links.id, url: links.url })
            .from(links)
            .where(and(eq(links.scanId, scan.id), eq(links.url, link.url)));
        
        if (healthyLinks.length > 1) {
            const keepers = [healthyLinks[0].id];
            await userDb.delete(links).where(and(
                eq(links.scanId, scan.id),
                eq(links.url, link.url),
                inArray(links.id, healthyLinks.slice(1).map((l: any) => l.id))
            ));
            // Ensure the keeper has no parentUrl as per user request
            await userDb.update(links).set({ parentUrl: null }).where(eq(links.id, keepers[0]));
        } else if (healthyLinks.length === 1) {
            await userDb.update(links).set({ parentUrl: null }).where(eq(links.id, healthyLinks[0].id));
        }
    }

    // Recursive Extraction logic
    // depth=0 means unlimited. If missing, we default to 2 levels.
    const maxDepth = (config.maxDepth !== undefined) ? config.maxDepth : 2;
    const currentDepth = link.depth || 0;

    // 2. Traversal Rules (Check but don't traverse if skipReason is set)
    let shouldTraverse = response.ok && !skipReason && contentType.includes('text/html') && (maxDepth === 0 || currentDepth < maxDepth);

        let traversalSkipReason: string | null = skipReason;
    if (shouldTraverse) {
        // Rule: Regex/Wildcard Exclusions
            const exclusion = shouldExclude(link.url, config);
            if (exclusion.excluded) {
            shouldTraverse = false;
                traversalSkipReason = exclusion.reason || 'Excluded by rule';
        }
    }

        if (!shouldTraverse && traversalSkipReason) {
            console.log(`[Skip Traversal] ${link.url} (Depth: ${currentDepth}) - Reason: ${traversalSkipReason}`);
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
            
            // Normalize out Drupal/PHP front controllers (index.php and index%2ephp) at the root of the path
            urlObj.pathname = urlObj.pathname
              .replace(/^\/index\.php\/?/i, '/')
              .replace(/^\/index%2[eE]php\/?/i, '/');
            
            const urlStr = urlObj.toString().replace(/\/$/, '');
            
            const snippet = $.html(el).slice(0, 500); 

            if (!foundLinks.has(urlStr)) {
                foundLinks.set(urlStr, { snippet });
            }
          }
                } catch {}
      });

      const allUrls = Array.from(foundLinks.keys());
      if (allUrls.length === 0) return [];


      
      const targetUrls = (config.targetUrls || []).map((t: string) => t.trim().replace(/\/$/, ''));
      const newLinksToAdd: any[] = [];

      await userDb.transaction(async (tx: any) => {
        // Fetch latest statuses inside the transaction to avoid race conditions with other concurrent jobs
        const latestOccurrences = await tx.select({ 
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

        const latestByUrl = new Map<string, any[]>();
        latestOccurrences.forEach((l: any) => {
            if (!latestByUrl.has(l.url)) latestByUrl.set(l.url, []);
            latestByUrl.get(l.url)!.push(l);
        });

        for (const [urlStr, info] of foundLinks) {
          const skipReason = getSkipReason(urlStr, config);
          if (skipReason) {
              if (config.saveSkippedLinks) {
                  const depthToAdd = currentDepth + 1;
                  const finalLink: any = {
                      id: crypto.randomUUID(),
                      scanId: scan.id,
                      url: urlStr,
                      parentUrl: link.url,
                      status: 'SKIPPED',
                      depth: depthToAdd,
                      snippet: info.snippet,
                      checkedAt: new Date(),
                      statusCode: null,
                      error: skipReason,
                      type: null
                  };
                  await tx.insert(links).values(finalLink);
              }
              continue; // Do not fetch/queue if skipped by rules
          }

          const isTarget = isTargeted && targetUrls.includes(urlStr);

          if (isTargeted && !isTarget) {
              // In targeted mode, still traverse internal pages so we can find which page
              // links to the target URL (full-site crawl, results focused on targets).
              // Skip non-internal (external / subdomain-excluded) URLs.
              try {
                  const startHost = new URL(config.startUrl).hostname.toLowerCase().replace(/^www\./, '');
                  const urlHost = new URL(urlStr).hostname.toLowerCase().replace(/^www\./, '');
                  const isInternalTraversable = urlHost === startHost ||
                      (!config.excludeSubdomains && urlHost.endsWith('.' + startHost));
                  if (!isInternalTraversable) continue;
              } catch (e) {
                  continue;
              }
          }

          const occurrences = latestByUrl.get(urlStr) || [];

          if (isTarget) {
              // Target URL: record every unique parentUrl to build a full backlink map.
              if (occurrences.some(o => o.parentUrl === link.url)) continue;
          } else if (isTargeted) {
              // Internal traversal page in targeted mode: visit only once (like normal mode).
              if (occurrences.some(o => o.status === 'SUCCESS' || o.status === 'PENDING' || o.status === 'PROCESSING')) continue;
          } else {
              // Discovery Logic: Skip if already known as SUCCESS
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

          const definitive = occurrences.find(o => o.status === 'SUCCESS' || o.status === 'BROKEN' || o.status === 'SKIPPED');
          if (definitive) {
              if (definitive.status === 'SUCCESS' && !isTargeted) {
                  continue; 
              }
              finalLink.status = definitive.status;
              finalLink.statusCode = definitive.statusCode;
              finalLink.error = definitive.error;
              finalLink.type = definitive.type;
              finalLink.checkedAt = new Date();
          }

          await tx.insert(links).values(finalLink);
          
          // NEW: Immediate Status Inheritance
          // If another task already finished this URL during this transaction's window, pull its status now.
          // This prevents the race condition where we insert as PENDING just as another worker finishes.
          await tx.execute(sql`
            UPDATE links l1
            SET status = l2.status, 
                status_code = l2.status_code, 
                error = l2.error, 
                type = l2.type, 
                checked_at = l2.checked_at
            FROM links l2
            WHERE l1.id = ${finalLink.id}
              AND l2.scan_id = ${scan.id}
              AND l2.url = ${urlStr}
              AND l2.status IN ('SUCCESS', 'BROKEN', 'SKIPPED')
              AND l1.status = 'PENDING'
          `);

          // Re-fetch status to ensure enqueuing logic is accurate
          const updatedLinkResults = await tx.select({ status: links.status })
            .from(links)
            .where(eq(links.id, finalLink.id))
            .limit(1);

          const updatedLink = updatedLinkResults[0];

          if (updatedLink) finalLink.status = updatedLink.status;
          
          // Only enqueue if this is the very first time we've seen this URL in a PENDING state for this scan
          if (finalLink.status === 'PENDING') {
              const isAlreadyQueued = occurrences.some(o => o.status === 'PENDING' || o.status === 'PROCESSING');
              if (!isAlreadyQueued) {
                  newLinksToAdd.push(finalLink);
              }
          }
        }
      });

      return newLinksToAdd;
    }
    return [];

  } catch (error: any) {
    let errorMsg = error.name === 'AbortError' ? 'Timeout (15s limit)' : error.message;
    const causeMessage = error?.cause?.message;
    if (causeMessage && typeof causeMessage === 'string') {
        errorMsg = `${errorMsg} | cause: ${causeMessage}`;
    }
    if (error.code) {
        errorMsg = `[${error.code}] ${errorMsg}`;
    }
    await userDb.update(links).set({
      status: 'BROKEN',
      error: errorMsg,
      checkedAt: new Date()
    }).where(and(
      eq(links.scanId, scan.id), 
      eq(links.url, link.url), 
      or(eq(links.status, 'PENDING'), eq(links.status, 'PROCESSING'))
    ));
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

    // 1. Legacy excludeRegex (Single string)
    if (config.excludeRegex) {
        const cleanRule = sanitizePattern(config.excludeRegex);
        if (cleanRule) {
            try {
                const re = new RegExp(cleanRule, 'i');
                if (re.test(urlStr) || re.test(normalizedUrl)) {
                    return { excluded: true, reason: `Legacy Regex Rule: ${cleanRule}` };
                }
            } catch (e) {}
        }
    }

    // 2. Modern regexRules (Array of strings)
    if (config.regexRules && Array.isArray(config.regexRules)) {
        for (const rule of config.regexRules) {
            const cleanRule = sanitizePattern(rule);
            if (!cleanRule) continue;
            try {
                const re = new RegExp(cleanRule, 'i');
                if (re.test(urlStr) || re.test(normalizedUrl)) {
                    return { excluded: true, reason: `Regex Rule: ${cleanRule}` };
                }
            } catch (e) {}
        }
    }

    // 3. Wildcard Exclusions
    if (config.wildcardExclusions && Array.isArray(config.wildcardExclusions)) {
        for (const pattern of config.wildcardExclusions) {
            const cleanPattern = sanitizePattern(pattern);
            if (!cleanPattern) continue;
            try {
                const regexStr = cleanPattern
                    .replace(/[.+*?^${}()|[\]\\]/g, '\\$&') // ESCAPE ALL including * and ?
                    .replace(/\\\*/g, '.*')
                    .replace(/\\\?/g, '.');
                
                const re = new RegExp(regexStr, 'i'); // Removed strict anchors for better wildcard flexibility
                if (re.test(urlStr) || re.test(normalizedUrl)) {
                    return { excluded: true, reason: `Wildcard Rule: ${cleanPattern}` };
                }
            } catch (res: any) {}
        }
    }

    return { excluded: false };
}

function getSkipReason(urlStr: string, config: any): string | null {
    try {
        const startUrlObj = new URL(config.startUrl);
        const currentUrlObj = new URL(urlStr);
        
        // Normalize hostnames (remove www. and lowercase)
        const startHost = startUrlObj.hostname.toLowerCase().replace(/^www\./, '');
        const currentHost = currentUrlObj.hostname.toLowerCase().replace(/^www\./, '');
        
        const isExactHost = currentHost === startHost;
        const isSubdomain = currentHost.endsWith('.' + startHost);
        const isInternal = isExactHost || isSubdomain;

        // 1. External
        // REMOVED: Now handled in processLink to allow "Verify but not crawl"
        // if (!isInternal && config.skipExternal) {
        //     return `External link (Target: ${currentHost} vs Start: ${startHost})`;
        // }

        // 2. Subdomain
        // REMOVED: Now handled in processLink to allow "Verify but not crawl"
        // if (isSubdomain && !isExactHost && config.excludeSubdomains) {
        //     return `Subdomain excluded: ${currentHost}`;
        // }

        // 3. Backward
        // REMOVED: Now handled in processLink for consistency
        // if (config.doNotTraverseBackward) {
        //     const normalize = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
        //     const normalizedStart = normalize(config.startUrl);
        //     const normalizedCurrent = normalize(urlStr);

        //     if (!normalizedCurrent.startsWith(normalizedStart)) {
        //         return `Stay in Subpath: ${normalizedCurrent} does not start with ${normalizedStart}`;
        //     } else {
        //         const remaining = normalizedCurrent.slice(normalizedStart.length);
        //         if (remaining.length > 0 && !remaining.startsWith('/')) {
        //             return "Stay in Subpath: Not a sub-folder";
        //         }
        //     }
        // }

        // 4. Regex/Wildcard
        const exclusion = shouldExclude(urlStr, config);
        if (exclusion.excluded) {
            return exclusion.reason || "Matches exclusion rule";
        }
    } catch (e: any) {
        return `Invalid URL format: ${e.message}`;
    }

    return null;
}
