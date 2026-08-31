import { getDb, db as centralDb } from '../db';
import { scans, links, users } from '../db/schema';
import { eq, and, or, inArray, sql } from 'drizzle-orm';
import crypto from 'crypto';
import {
  canonicalizeScanUrl,
  getFetchUrl,
  getUrlWithoutHash,
  isTargetUrlMatch,
  isSameOrSubdomain,
  normalizeHostname,
  shouldExclude,
  getSkipReason,
  getTraversalSkipReason,
  isAuthGatedResponse,
  fetchWithRedirects,
  isSafeHostname,
  discoverLinks,
} from '@lynx/crawler-core';

const activeCrawls = new Map<string, Promise<void>>(); // Scan-scoped fetch cache

export async function processLink(userDb: any, link: any, scan: any, config: any) {

  // Re-check status before starting (in case it was paused during batch wait)
  const currentScan = await userDb.select().from(scans).where(eq(scans.id, scan.id)).then((res: any[]) => res[0]);
  if (!currentScan || currentScan.status !== 'RUNNING') return;

  const isTargeted = !!config.isTargeted && (config.targetUrls?.length > 0);
  const documentUrl = getUrlWithoutHash(link.url);
  const fetchUrl = getFetchUrl(link.url);
  const crawlKey = `${scan.id}:${documentUrl}`;

  // NEW: Wait if this URL is already being fetched in this scan
  if (activeCrawls.has(crawlKey)) {
    await activeCrawls.get(crawlKey);
    const sibling = await userDb.select().from(links).where(and(
      eq(links.scanId, scan.id),
      or(eq(links.url, link.url), eq(links.url, documentUrl)),
      or(eq(links.status, 'SUCCESS'), eq(links.status, 'BROKEN'), eq(links.status, 'SKIPPED'))
    )).then((rows: any[]) => rows[0]);
    if (sibling) {
      await userDb.update(links).set({
        status: sibling.status,
        statusCode: sibling.statusCode,
        type: sibling.type,
        error: sibling.error,
        checkedAt: new Date(),
      }).where(and(
        eq(links.scanId, scan.id),
        eq(links.url, link.url),
        or(eq(links.status, 'PENDING'), eq(links.status, 'PROCESSING'))
      ));
    }
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
        or(eq(links.url, link.url), eq(links.url, documentUrl))
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

        let response = await fetchWithRedirects(fetchUrl, headers, controller.signal);

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
        
        const retryResponse = await fetchWithRedirects(fetchUrl, fallbackHeaders, controller.signal);
        if (retryResponse.ok || (retryResponse.status !== 403 && retryResponse.status !== 400)) {
            response = retryResponse;
        }
    }

    clearTimeout(timeoutId);

    const contentType = (response.headers.get('content-type') || '').split(';')[0];
    let status = response.ok ? 'SUCCESS' : 'BROKEN';
    const statusCode = response.status;


    let skipReason: string | null = getTraversalSkipReason(link.url, config, status);

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

    const urlsToUpdate = new Set<string>([link.url, documentUrl]);
    for (const target of (config.targetUrls || [])) {
        if (getUrlWithoutHash(target) === documentUrl) {
            urlsToUpdate.add(canonicalizeScanUrl(target));
        }
    }

    await userDb.update(links).set(updateData)
      .where(and(
        eq(links.scanId, scan.id),
        inArray(links.url, Array.from(urlsToUpdate)),
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
      const discoveredLinks = discoverLinks(html, link.url, config, currentDepth);
            const allUrls = Array.from(new Set(discoveredLinks.flatMap((entry) => {
                const canonical = canonicalizeScanUrl(entry.url);
                const doc = getUrlWithoutHash(canonical);
                return canonical !== doc ? [canonical, doc] : [canonical];
            })));
            if (documentUrl && !allUrls.includes(documentUrl)) {
                allUrls.push(documentUrl);
            }
      if (allUrls.length === 0) return [];


      
            const targetUrls = (config.targetUrls || []).map((t: string) => canonicalizeScanUrl(t));
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

                const rememberOccurrence = (row: any) => {
                    if (!latestByUrl.has(row.url)) latestByUrl.set(row.url, []);
                    latestByUrl.get(row.url)!.push(row);
                };

                for (const foundLink of discoveredLinks) {
                    let { url: urlStr, parentUrl, snippet, depth: depthToAdd } = foundLink;
          const skipReason = getSkipReason(urlStr, config);
          if (skipReason) {
              if (config.saveSkippedLinks) {
                  const finalLink: any = {
                      id: crypto.randomUUID(),
                      scanId: scan.id,
                      url: urlStr,
                      parentUrl,
                      status: 'SKIPPED',
                      depth: depthToAdd,
                      snippet,
                      checkedAt: new Date(),
                      statusCode: null,
                      error: skipReason,
                      type: null
                  };
                  await tx.insert(links).values(finalLink);
                  rememberOccurrence(finalLink);
              }
              continue; // Do not fetch/queue if skipped by rules
          }

          const isTarget = isTargeted && targetUrls.some((target: string) => isTargetUrlMatch(urlStr, target));
          const foundDocumentUrl = getUrlWithoutHash(urlStr);
          const originalIsFragment = canonicalizeScanUrl(urlStr) !== foundDocumentUrl;

          if (originalIsFragment && !isTarget) {
              urlStr = foundDocumentUrl;
          }

          const storedIsFragment = canonicalizeScanUrl(urlStr) !== getUrlWithoutHash(urlStr);

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
              if (occurrences.some(o => o.parentUrl === parentUrl)) continue;
          } else if (isTargeted) {
              // Internal traversal page in targeted mode: visit only once (like normal mode).
              if (occurrences.some(o => o.status === 'SUCCESS' || o.status === 'PENDING' || o.status === 'PROCESSING')) continue;
          } else {
              // Discovery Logic: Skip if already known as SUCCESS
              if (occurrences.some(o => o.status === 'SUCCESS')) continue;
          }

          const finalLink: any = {
              id: crypto.randomUUID(),
              scanId: scan.id,
              url: urlStr,
              parentUrl,
              status: 'PENDING',
              depth: depthToAdd,
              snippet,
              checkedAt: null,
              statusCode: null,
              error: null,
              type: null
          };

          const documentOccurrences = latestByUrl.get(foundDocumentUrl) || [];
          const definitive = occurrences.find(o => o.status === 'SUCCESS' || o.status === 'BROKEN' || o.status === 'SKIPPED')
              || (storedIsFragment ? documentOccurrences.find(o => o.status === 'SUCCESS' || o.status === 'BROKEN' || o.status === 'SKIPPED') : undefined);

          if (storedIsFragment && isTarget && foundDocumentUrl === documentUrl) {
              finalLink.status = status;
              finalLink.statusCode = statusCode;
              finalLink.error = errorDetail;
              finalLink.type = contentType;
              finalLink.checkedAt = new Date();
          } else if (definitive) {
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
          rememberOccurrence(finalLink);
          
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
          
          // Never fetch hash-only variants; crawl the document URL instead.
          const shouldEnqueue = finalLink.status === 'PENDING' && !storedIsFragment;
          if (shouldEnqueue) {
              const isAlreadyQueued = occurrences.some(o => o.status === 'PENDING' || o.status === 'PROCESSING');
              if (!isAlreadyQueued) {
                  newLinksToAdd.push(finalLink);
              }
          }

          if (storedIsFragment && isTarget && foundDocumentUrl !== documentUrl) {
              const docOcc = latestByUrl.get(foundDocumentUrl) || [];
              const docAlreadyKnown = docOcc.some(o => o.status === 'SUCCESS' || o.status === 'PENDING' || o.status === 'PROCESSING' || o.status === 'BROKEN' || o.status === 'SKIPPED');
              if (!docAlreadyKnown) {
                  const docLink: any = {
                      id: crypto.randomUUID(),
                      scanId: scan.id,
                      url: foundDocumentUrl,
                      parentUrl,
                      status: 'PENDING',
                      depth: depthToAdd,
                      snippet: null,
                      checkedAt: null,
                      statusCode: null,
                      error: null,
                      type: null
                  };
                  await tx.insert(links).values(docLink);
                  rememberOccurrence(docLink);
                  newLinksToAdd.push(docLink);
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
