import { getDb, db as centralDb } from '../db';
import { scans, links, users } from '../db/schema';
import { eq, and, or, inArray, desc } from 'drizzle-orm';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import crypto from 'crypto';

// Global worker state
let isWorkerRunning = false;
const globalLimit = pLimit(10); // System-wide concurrent requests cap
const activeCrawls = new Map<string, Promise<void>>(); // Scan-scoped fetch cache

export function startWorker() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;
  console.log('Starting background crawler worker...');
  
  // Run the loop every 3 seconds for faster pick-up
  setInterval(async () => {
    try {
      await processNextBatch();
    } catch (error) {
      console.error('Worker error:', error);
    }
  }, 3000);
}

async function processNextBatch() {
  // 1. Find users who have active scans (from central DB)
  const activeUsers = await centralDb.select().from(users).where(eq(users.hasActiveScan, true));
  if (activeUsers.length === 0) return;

  for (const user of activeUsers) {
    if (user.role !== 'ADMIN' && user.role !== 'USER') {
      // Safety: If user is no longer approved, stop their scans
      const userDb = getDb(user.id);
      await userDb.update(scans).set({ status: 'PAUSED' }).where(eq(scans.status, 'RUNNING'));
      await centralDb.update(users).set({ hasActiveScan: false }).where(eq(users.id, user.id));
      continue;
    }

    const userDb = getDb(user.id);
    
    // Find running scans for THIS user in THEIR database
    const runningScans = await userDb.select().from(scans).where(eq(scans.status, 'RUNNING'));
    
    if (runningScans.length === 0) {
      // Optimization: No more running scans for this user, mark them as inactive in central DB
      await centralDb.update(users).set({ hasActiveScan: false }).where(eq(users.id, user.id));
      continue;
    }

    for (const scan of runningScans) {
      let config;
      try {
          config = typeof scan.config === 'string' ? JSON.parse(scan.config || '{}') : scan.config;
      } catch (e) {
          console.error(`Malformed config for scan ${scan.id} (User: ${user.id})`, e);
          await userDb.update(scans).set({ status: 'FAILED' }).where(eq(scans.id, scan.id));
          continue;
      }
      
      // Get pending links for this scan, prioritizing re-checked links
      const pendingLinks = await userDb.select().from(links)
        .where(and(eq(links.scanId, scan.id), eq(links.status, 'PENDING')))
        .orderBy(desc(links.isRechecked))
        .limit(user.maxJobs * 5) // Batch size relative to user quota
        ;

      if (pendingLinks.length === 0) {
        // Double check if really done (no more pending links in user DB)
        const anyPending = await userDb.select().from(links)
          .where(and(eq(links.scanId, scan.id), eq(links.status, 'PENDING')))
          .then((res: any[]) => res[0]);
        
        if (!anyPending) {
          await userDb.update(scans).set({ status: 'COMPLETED', updatedAt: new Date() }).where(eq(scans.id, scan.id));
        }
        continue;
      }

      // Process links using BOTH user limit and global limit
      const userLimit = pLimit(user.maxJobs);
      
      await Promise.all(pendingLinks.map(link => 
        userLimit(() => globalLimit(() => processLink(userDb, link, scan, config)))
      ));
    }
  }
}

async function processLink(userDb: any, link: any, scan: any, config: any) {
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
    const headers: Record<string, string> = { 'User-Agent': 'LynxScan/1.0' };
    if (config.auth && config.auth.username && config.auth.password) {
        const auth = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
    }

    // Runtime exclusion check
    const exclusion = shouldExclude(link.url, config);
    if (exclusion.excluded) {
      await userDb.update(links).set({
        status: 'SKIPPED',
        parentUrl: isTargeted ? link.parentUrl : null,
        snippet: `[Runtime Skip: ${exclusion.reason}] ` + (link.snippet || ''),
        checkedAt: new Date()
      }).where(and(eq(links.scanId, scan.id), eq(links.url, link.url), eq(links.status, 'PENDING')));
      return;
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
    
    // Optional: snippet update only if it was redefined by result (rare)
    // We keep individual snippets as they represent where the link was found
    
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

    if (response.ok && contentType.includes('text/html') && (maxDepth === 0 || currentDepth < maxDepth)) {
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

      const foundLinks = new Map<string, { snippet: string, isExcluded: boolean }>();
      
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        
        try {
          const urlObj = new URL(href, link.url);
          if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
            urlObj.hash = '';
            const urlStr = urlObj.toString().replace(/\/$/, '');
            
            // Advanced Filtering (Consolidated Regex & Wildcards)
            const exclusion = shouldExclude(urlStr, config);
            const snippet = $.html(el).slice(0, 500); 

            // Only keep the first occurrence of a URL per page
            if (!foundLinks.has(urlStr)) {
                foundLinks.set(urlStr, { 
                    snippet: exclusion.excluded ? `[Skipped: ${exclusion.reason}] ${snippet}` : snippet, 
                    isExcluded: exclusion.excluded 
                });
            }
          }
        } catch (e) {}
      });

      // Filter out links that already exist in this scan in bulk
      const allUrls = Array.from(foundLinks.keys());
      if (allUrls.length === 0) return;

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
      
      // Group existing links by URL for faster lookup
      const linksByUrl = new Map<string, any[]>();
      existingLinks.forEach((l: any) => {
          if (!linksByUrl.has(l.url)) linksByUrl.set(l.url, []);
          linksByUrl.get(l.url)!.push(l);
      });
      
      // Parse targets for deduplication logic
      const targetUrls = (config.targetUrls || []).map((t: string) => t.trim().replace(/\/$/, ''));
      const isTargeted = !!config.isTargeted && (config.targetUrls?.length > 0);

      await userDb.transaction(async (tx: any) => {
        for (const [urlStr, info] of foundLinks) {
          const occurrences = linksByUrl.get(urlStr) || [];
          
          if (isTargeted) {
              // Targeted Scan: Deduplicate by exact (url, parent) pair
              if (occurrences.some(o => o.parentUrl === link.url)) continue;
          } else {
              // Performance Optimized Scan:
              // 1. If it's a known SUCCESS or SKIPPED result, don't record another occurrence.
              if (occurrences.some(o => o.status === 'SUCCESS' || o.status === 'SKIPPED')) continue;
              
              // 2. If it's PENDING and NOT known broken, don't record another occurrence
              // (This prevents redundant fetches for the same URL before it finishes)
              const anyBroken = occurrences.some(o => o.status === 'BROKEN');
              if (!anyBroken && occurrences.length > 0) continue;
              
              // Note: If anyBroken is true, we proceed to record the new occurrence to show where it's broken.
          }

          if (info.isExcluded) {
              await tx.insert(links).values({
                  id: crypto.randomUUID(),
                  scanId: scan.id,
                  url: urlStr,
                  parentUrl: isTargeted ? link.url : null, // Remove parent for performance if not targeted
                  status: 'SKIPPED',
                  depth: currentDepth + 1,
                  snippet: info.snippet,
                  checkedAt: new Date()
              });
          } else {
              // Check if we already have a definitive result for this URL
              const definitive = occurrences.find(o => o.status === 'SUCCESS' || o.status === 'BROKEN');
              const finalStatus = definitive ? definitive.status : 'PENDING';
              
              await tx.insert(links).values({
                  id: crypto.randomUUID(),
                  scanId: scan.id,
                  url: urlStr,
                  // Use null for successful links in non-targeted scans
                  parentUrl: (finalStatus === 'SUCCESS' && !isTargeted) ? null : link.url,
                  status: finalStatus,
                  statusCode: definitive?.statusCode,
                  error: definitive?.error,
                  type: definitive?.type,
                  depth: currentDepth + 1,
                  snippet: info.snippet,
                  checkedAt: definitive ? new Date() : null
              });
          }
        }
      });
    }

  } catch (error: any) {
    const errorMsg = error.name === 'AbortError' ? 'Timeout' : error.message;
    await userDb.update(links).set({
      status: 'BROKEN',
      error: errorMsg,
      checkedAt: new Date()
    }).where(and(eq(links.scanId, scan.id), eq(links.url, link.url), eq(links.status, 'PENDING')));
  } finally {
    activeCrawls.delete(crawlKey);
    resolveCrawl!();
  }
}

// Helper for exclusion logic
function shouldExclude(urlStr: string, config: any): { excluded: boolean, reason?: string } {
    const normalizedUrl = urlStr.replace(/^https?:\/\/(www\.)?/, '');
    
    // Helper to sanitize regex from user input (handles stray quotes and double-escapes)
    const sanitizePattern = (p: string) => {
        if (!p) return null;
        // Strip trailing quotes (common JSON edit error) and handle double-slashes
        let cleaned = p.trim().replace(/^["']|["']$/g, '');
        // If it looks like a double-escaped JSON string, fix it
        if (cleaned.includes('\\\\')) cleaned = cleaned.replace(/\\\\/g, '\\');
        return cleaned;
    };

    // 0. Domain/External Logic
    try {
        const startUrlObj = new URL(config.startUrl);
        const currentUrlObj = new URL(urlStr);
        
        const startHost = startUrlObj.hostname.toLowerCase().replace(/^www\./, '');
        const currentHost = currentUrlObj.hostname.toLowerCase().replace(/^www\./, '');

        if (config.skipExternal && currentHost !== startHost) {
            // Special case for Targeted Audit: strictly block non-domain links unless they are explicitly targets
            // (The isTarget check happens in the loop, but shouldExclude acts as the primary gate)
            if (config.excludeSubdomains || !currentHost.endsWith('.' + startHost)) {
                return { excluded: true, reason: 'External Domain' };
            }
        }

        if (config.excludeSubdomains && currentHost !== startHost) {
            return { excluded: true, reason: 'Subdomain Excluded' };
        }

        // Do Not Traverse Backward (Stay in Subpath)
        if (config.doNotTraverseBackward) {
            const normalize = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
            const normalizedStart = normalize(config.startUrl);
            const normalizedCurrent = normalize(urlStr);

            // Check if it starts with the normalized start URL
            if (!normalizedCurrent.startsWith(normalizedStart)) {
                return { excluded: true, reason: 'Traverse Backward' };
            }
            
            // Ensure it's a proper subpath (either same URL or next char is /)
            const remaining = normalizedCurrent.slice(normalizedStart.length);
            if (remaining.length > 0 && !remaining.startsWith('/')) {
                return { excluded: true, reason: 'Traverse Backward' };
            }
        }
    } catch (e) {}

    // 1. Regex Rules
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

    // 2. Wildcard Exclusions
    if (config.wildcardExclusions && Array.isArray(config.wildcardExclusions)) {
        for (const pattern of config.wildcardExclusions) {
            const cleanPattern = sanitizePattern(pattern);
            if (!cleanPattern) continue;
            try {
                const regexStr = cleanPattern
                    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                    .replace(/\\\*/g, '.*')
                    .replace(/\\\?/g, '.');
                
                const re = new RegExp(regexStr);
                if (re.test(urlStr) || re.test(normalizedUrl)) {
                    return { excluded: true, reason: `Wildcard: ${cleanPattern}` };
                }
            } catch (res: any) {
                if (res.status === 404) return { excluded: false };
            }
        }
    }

    return { excluded: false };
}
