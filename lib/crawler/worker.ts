import { db } from '../db';
import { scans, links, users } from '../db/schema';
import { eq, and, or, inArray } from 'drizzle-orm';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';

// Global worker state
let isWorkerRunning = false;
const globalLimit = pLimit(10); // System-wide concurrent requests cap

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
  // Find running scans
  const runningScans = db.select().from(scans).where(eq(scans.status, 'RUNNING')).all();
  if (runningScans.length === 0) return;

  for (const scan of runningScans) {
    const user = db.select().from(users).where(eq(users.id, scan.userId)).get();
    if (!user || (user.role !== 'ADMIN' && user.role !== 'USER')) {
      db.update(scans).set({ status: 'PAUSED' }).where(eq(scans.id, scan.id)).run();
      continue;
    }

    let config;
    try {
        config = typeof scan.config === 'string' ? JSON.parse(scan.config || '{}') : scan.config;
    } catch (e) {
        console.error(`Malformed config for scan ${scan.id}`, e);
        db.update(scans).set({ status: 'FAILED' }).where(eq(scans.id, scan.id)).run();
        continue;
    }
    const maxDepth = config.maxDepth ?? 0; // 0 = unlimited
    
    // Get pending links for this scan
    const pendingLinks = db.select().from(links)
      .where(and(eq(links.scanId, scan.id), eq(links.status, 'PENDING')))
      .limit(user.maxJobs * 5) // Batch size relative to user quota
      .all();

    if (pendingLinks.length === 0) {
      // Double check if really done (no more pending links in DB)
      const anyPending = db.select().from(links)
        .where(and(eq(links.scanId, scan.id), eq(links.status, 'PENDING')))
        .get();
      
      if (!anyPending) {
        db.update(scans).set({ status: 'COMPLETED', updatedAt: new Date() }).where(eq(scans.id, scan.id)).run();
      }
      continue;
    }

    // Process links using BOTH user limit and global limit
    const userLimit = pLimit(user.maxJobs);
    
    await Promise.all(pendingLinks.map(link => 
      userLimit(() => globalLimit(() => processLink(link, scan, config)))
    ));
  }
}

async function processLink(link: any, scan: any, config: any) {
  // Re-check status before starting (in case it was paused during batch wait)
  const currentScan = db.select().from(scans).where(eq(scans.id, scan.id)).get();
  if (!currentScan || currentScan.status !== 'RUNNING') return;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
    
    // HTTP Basic Auth
    const headers: Record<string, string> = { 'User-Agent': 'BrokenLinkChecker/1.0' };
    if (config.auth && config.auth.username && config.auth.password) {
        const auth = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
    }

    const response = await fetch(link.url, {
      signal: controller.signal,
      headers
    });
    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') || '';
    const status = response.ok ? 'SUCCESS' : 'BROKEN';
    const statusCode = response.status;
    
    db.update(links).set({
      status,
      statusCode,
      type: contentType.split(';')[0],
      checkedAt: new Date()
    }).where(eq(links.id, link.id)).run();

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
            const isExcluded = shouldExclude(urlStr, config);
            const snippet = $.html(el).slice(0, 500); 

            // Only keep the first occurrence of a URL per page
            if (!foundLinks.has(urlStr)) {
                foundLinks.set(urlStr, { snippet, isExcluded });
            }
          }
        } catch (e) {}
      });

      // Filter out links that already exist in this scan in bulk
      const allUrls = Array.from(foundLinks.keys());
      if (allUrls.length === 0) return;

      const existingLinks = db.select({ url: links.url })
        .from(links)
        .where(and(eq(links.scanId, scan.id), inArray(links.url, allUrls)))
        .all();
      
      const existingSet = new Set(existingLinks.map(l => l.url));

      db.transaction((tx) => {
        for (const [urlStr, info] of foundLinks) {
          if (existingSet.has(urlStr)) continue;

          if (info.isExcluded) {
              tx.insert(links).values({
                  id: crypto.randomUUID(),
                  scanId: scan.id,
                  url: urlStr,
                  parentUrl: link.url,
                  status: 'SKIPPED',
                  depth: currentDepth + 1,
                  snippet: info.snippet,
                  checkedAt: new Date()
              }).run();
          } else {
              tx.insert(links).values({
                  id: crypto.randomUUID(),
                  scanId: scan.id,
                  url: urlStr,
                  parentUrl: link.url,
                  status: 'PENDING',
                  depth: currentDepth + 1,
                  snippet: info.snippet,
              }).run();
          }
        }
      });
    }

  } catch (error: any) {
    const errorMsg = error.name === 'AbortError' ? 'Timeout' : error.message;
    db.update(links).set({
      status: 'BROKEN',
      error: errorMsg,
      checkedAt: new Date()
    }).where(eq(links.id, link.id)).run();
  }
}

// Helper for exclusion logic migrated from inline
function shouldExclude(urlStr: string, config: any): boolean {
    const normalizedUrl = urlStr.replace(/^https?:\/\/(www\.)?/, '');

    // 1. Existing excludeRegex (legacy)
    if (config.excludeRegex) {
        try {
            const re = new RegExp(config.excludeRegex);
            if (re.test(urlStr) || re.test(normalizedUrl)) return true;
        } catch (e) {}
    }

    // 2. Regex Rules
    if (config.regexRules && Array.isArray(config.regexRules)) {
        for (const rule of config.regexRules) {
            try {
                // Trim stray quotes that might come from JSON copy-paste errors
                const cleanRule = rule.replace(/^"|"$/g, '');
                const re = new RegExp(cleanRule);
                if (re.test(urlStr) || re.test(normalizedUrl)) return true;
            } catch (e) {}
        }
    }

    // 3. Wildcard Exclusions
    if (config.wildcardExclusions && Array.isArray(config.wildcardExclusions)) {
        for (const pattern of config.wildcardExclusions) {
            try {
                // Convert wildcard to regex: * -> .*, ? -> .
                const regexStr = pattern
                    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex chars
                    .replace(/\\\*/g, '.*')               // unescape and convert *
                    .replace(/\\\?/g, '.');               // unescape and convert ?
                
                const re = new RegExp(regexStr); // No ^ or $ anchoring
                if (re.test(urlStr) || re.test(normalizedUrl)) return true;
            } catch (e) {}
        }
    }

    return false;
}
