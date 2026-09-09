import { getDb, db as centralDb } from '../db';
import { scans, links, users } from '../db/schema';
import { eq, and, or, inArray, sql } from 'drizzle-orm';
import crypto from 'crypto';
import {
  canonicalizeScanUrl,
  getUrlWithoutHash,
  isTargetUrlMatch,
  isSameOrSubdomain,
  normalizeHostname,
  shouldExclude,
  getSkipReason,
  getTraversalSkipReason,
  isSafeHostname,
  discoverLinks,
  fetchResource,
  FAILED_CLOUDFLARE_CHALLENGE,
  formatChallengeError,
} from '@lynx/crawler-core';
import {
  fetchConfigWithSession,
  headersForHost,
  reloadScanConfig,
} from './cf-sessions';
import { tryEagerCloudflareUnlock } from './cf-eager';

const activeCrawls = new Map<string, Promise<void>>(); // Scan-scoped fetch cache

const TERMINAL_STATUSES = ['SUCCESS', 'BROKEN', 'SKIPPED', 'CHALLENGED'] as const;

function isTerminalStatus(status: string | null | undefined): boolean {
  return !!status && (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export async function processLink(userDb: any, link: any, scan: any, config: any) {

  // Re-check status before starting (in case it was paused during batch wait)
  const currentScan = await userDb.select().from(scans).where(eq(scans.id, scan.id)).then((res: any[]) => res[0]);
  if (!currentScan || currentScan.status !== 'RUNNING') return;

  const isTargeted = !!config.isTargeted && (config.targetUrls?.length > 0);
  const documentUrl = getUrlWithoutHash(link.url);
  const crawlKey = `${scan.id}:${documentUrl}`;

  // NEW: Wait if this URL is already being fetched in this scan
  if (activeCrawls.has(crawlKey)) {
    await activeCrawls.get(crawlKey);
    const sibling = await userDb.select().from(links).where(and(
      eq(links.scanId, scan.id),
      or(eq(links.url, link.url), eq(links.url, documentUrl)),
      or(eq(links.status, 'SUCCESS'), eq(links.status, 'BROKEN'), eq(links.status, 'SKIPPED'), eq(links.status, 'CHALLENGED'))
    )).then((rows: any[]) => rows[0]);
    if (sibling) {
      await userDb.update(links).set({
        status: sibling.status,
        statusCode: sibling.statusCode,
        type: sibling.type,
        error: sibling.error,
        cloudflareChallenge: sibling.cloudflareChallenge,
        bypassAttempted: sibling.bypassAttempted,
        isRechecked: sibling.isRechecked,
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
        // Honor discovery-time exclusions (regex/wildcard/subdomain) if a link was
        // already queued — e.g. before excludeSubdomains started skipping at enqueue.
        const preSkipReason = getSkipReason(link.url, config);
        if (preSkipReason) {
            await userDb.update(links).set({
                status: 'SKIPPED',
                statusCode: null,
                type: null,
                checkedAt: new Date(),
                error: preSkipReason,
            }).where(and(
                eq(links.scanId, scan.id),
                eq(links.url, link.url),
                or(eq(links.status, 'PENDING'), eq(links.status, 'PROCESSING'))
            ));
            return;
        }

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

    // Single Crawl Guarantee: Handle PENDING or already checked results
    const existingRaw = await userDb.select().from(links)
      .where(and(
        eq(links.scanId, scan.id),
        or(eq(links.url, link.url), eq(links.url, documentUrl))
      ));

    const checkComplete = existingRaw.find((l: any) => isTerminalStatus(l.status));
    if (checkComplete) {
      await userDb.update(links).set({
        status: checkComplete.status,
        statusCode: checkComplete.statusCode,
        type: checkComplete.type,
        error: checkComplete.error,
        cloudflareChallenge: checkComplete.cloudflareChallenge,
        bypassAttempted: checkComplete.bypassAttempted,
        isRechecked: checkComplete.isRechecked,
        checkedAt: new Date(),
        snippet: `[Reused Result] ` + (link.snippet || '')
      }).where(and(
        eq(links.scanId, scan.id), 
        eq(links.url, link.url), 
        or(eq(links.status, 'PENDING'), eq(links.status, 'PROCESSING'))
      ));
      return; 
    }

    // Reload config so host sessions written by other jobs are visible.
    let liveConfig = (await reloadScanConfig(userDb, scan.id)) || config;
    const sessionHeaders = headersForHost(liveConfig, link.url);
    const fetchConfig = fetchConfigWithSession(liveConfig, link.url);
    let resource = await fetchResource(
      link.url,
      fetchConfig,
      Object.keys(sessionHeaders).length > 0 ? sessionHeaders : undefined,
    );
    let solvedViaBypass = false;
    let bypassAttempted = !!link.bypassAttempted;

    if (resource.blockedBySsrf) {
      await userDb.update(links).set({
        status: 'SKIPPED',
        statusCode: null,
        type: null,
        checkedAt: new Date(),
        error: resource.error || 'Blocked by SSRF protection policy',
      }).where(and(
        eq(links.scanId, scan.id),
        eq(links.url, link.url),
        or(eq(links.status, 'PENDING'), eq(links.status, 'PROCESSING'))
      ));
      return;
    }

    const unlocked = await tryEagerCloudflareUnlock({
      userDb,
      scanId: scan.id,
      url: link.url,
      liveConfig,
      resource,
      alreadyBypassAttempted: bypassAttempted,
    });
    resource = unlocked.resource;
    liveConfig = unlocked.liveConfig;
    solvedViaBypass = unlocked.solvedViaBypass;
    bypassAttempted = unlocked.bypassAttempted;

    const contentType = resource.contentType || '';
    let status: string;
    let errorDetail: string | null = resource.error;
    const statusCode = resource.statusCode;

    if (resource.challenged) {
      status = 'CHALLENGED';
      // fetchResource already embeds HTTP diagnostics when possible.
      errorDetail =
        resource.error?.startsWith(FAILED_CLOUDFLARE_CHALLENGE)
          ? resource.error
          : formatChallengeError({
              statusCode: resource.statusCode,
              headers: resource.headers,
              bodyPreview: resource.bodyText,
            });
      console.log(`[Cloudflare] ${link.url} — ${errorDetail.split('\n')[0]}`);
    } else if (resource.authGated) {
      status = 'SKIPPED';
      errorDetail = resource.error || `Auth-gated resource (${statusCode}) - not treated as broken`;
    } else if (resource.ok) {
      status = 'SUCCESS';
      errorDetail = resource.skipReason;
    } else if (resource.statusCode == null && resource.error) {
      status = 'BROKEN';
      errorDetail = resource.error;
    } else {
      status = 'BROKEN';
      errorDetail = resource.error;
    }

    let skipReason: string | null = resource.skipReason || getTraversalSkipReason(link.url, config, status === 'SUCCESS' ? 'SUCCESS' : 'BROKEN');

    if (skipReason && status === 'SUCCESS') {
        console.log(`[Info] ${link.url} traversal disabled after verification: ${skipReason}`);
    }

    // Bulk update all pending instances of this URL in this scan
    const updateData: any = {
      status,
      statusCode,
      type: contentType || null,
      checkedAt: new Date(),
      error: errorDetail,
      cloudflareChallenge: resource.challenged || solvedViaBypass || !!link.cloudflareChallenge,
      bypassAttempted,
      // Only mark rechecked when CF was unlocked to a successful page (not 404/broken).
      ...(solvedViaBypass && status === 'SUCCESS' ? { isRechecked: true } : {}),
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

    // 2. Traversal Rules (Check but don't traverse if skipReason is set or challenged)
    let shouldTraverse =
      status === 'SUCCESS' &&
      resource.ok &&
      !resource.challenged &&
      !skipReason &&
      contentType.includes('text/html') &&
      !!resource.bodyText &&
      (maxDepth === 0 || currentDepth < maxDepth);

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
      const html = resource.bodyText!;
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
          const definitive = occurrences.find(o => isTerminalStatus(o.status))
              || (storedIsFragment ? documentOccurrences.find(o => isTerminalStatus(o.status)) : undefined);

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
              AND l2.status IN ('SUCCESS', 'BROKEN', 'SKIPPED', 'CHALLENGED')
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
              const docAlreadyKnown = docOcc.some(o => o.status === 'SUCCESS' || o.status === 'PENDING' || o.status === 'PROCESSING' || o.status === 'BROKEN' || o.status === 'SKIPPED' || o.status === 'CHALLENGED');
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
