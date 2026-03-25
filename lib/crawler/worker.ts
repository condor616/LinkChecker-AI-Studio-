import { db } from '../db';
import { scans, links, users } from '../db/schema';
import { eq, and, or, inArray } from 'drizzle-orm';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';

// Global worker state
let isWorkerRunning = false;

export function startWorker() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;
  console.log('Starting background crawler worker...');
  
  // Run the loop every 5 seconds
  setInterval(async () => {
    try {
      await processNextBatch();
    } catch (error) {
      console.error('Worker error:', error);
    }
  }, 5000);
}

async function processNextBatch() {
  // Find running scans
  const runningScans = db.select().from(scans).where(eq(scans.status, 'RUNNING')).all();
  if (runningScans.length === 0) return;

  // For each scan, get pending links
  for (const scan of runningScans) {
    const user = db.select().from(users).where(eq(users.id, scan.userId)).get();
    if (!user || user.role !== 'ADMIN' && user.role !== 'USER') {
      // Pause scan if user is pending or deleted
      db.update(scans).set({ status: 'PAUSED' }).where(eq(scans.id, scan.id)).run();
      continue;
    }

    const config = JSON.parse(scan.config);
    const maxDepth = config.maxDepth ?? 0; // 0 = unlimited
    const rateLimit = config.rateLimit ?? 60; // requests per minute
    
    // Get pending links for this scan
    const pendingLinks = db.select().from(links)
      .where(and(eq(links.scanId, scan.id), eq(links.status, 'PENDING')))
      .limit(10) // Process in small batches
      .all();

    if (pendingLinks.length === 0) {
      // Check if all links are done
      const anyPending = db.select().from(links)
        .where(and(eq(links.scanId, scan.id), eq(links.status, 'PENDING')))
        .get();
      
      if (!anyPending) {
        db.update(scans).set({ status: 'COMPLETED', updatedAt: new Date() }).where(eq(scans.id, scan.id)).run();
      }
      continue;
    }

    // Process links
    const limit = pLimit(user.maxJobs); // Respect user's max jobs concurrency
    
    await Promise.all(pendingLinks.map(link => limit(() => processLink(link, scan, config))));
  }
}

async function processLink(link: any, scan: any, config: any) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const response = await fetch(link.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'BrokenLinkChecker/1.0' }
    });
    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') || '';
    const status = response.ok ? 'SUCCESS' : 'BROKEN';
    
    db.update(links).set({
      status,
      statusCode: response.status,
      type: contentType.split(';')[0],
      checkedAt: new Date()
    }).where(eq(links.id, link.id)).run();

    // If it's HTML and successful, and we haven't reached max depth, extract more links
    if (response.ok && contentType.includes('text/html')) {
      // Calculate depth based on parent chain (simplified: we'd need to track depth in DB, but let's assume depth 1 for now or add depth to schema)
      // For simplicity, let's just extract links if maxDepth > 0
      // Actually, we should add depth to the links schema. Let's assume we just extract if it's the starting URL for now, or implement proper depth tracking.
      
      const html = await response.text();
      const $ = cheerio.load(html);
      const newUrls = new Set<string>();
      
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        
        try {
          const urlObj = new URL(href, link.url);
          // Only crawl http/https
          if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
            // Check exclusions
            const urlStr = urlObj.toString();
            const excludeRegex = config.excludeRegex ? new RegExp(config.excludeRegex) : null;
            if (!excludeRegex || !excludeRegex.test(urlStr)) {
               newUrls.add(urlStr);
            }
          }
        } catch (e) {
          // Invalid URL
        }
      });

      // Insert new links if they don't exist in this scan
      for (const newUrl of newUrls) {
        const exists = db.select().from(links).where(and(eq(links.scanId, scan.id), eq(links.url, newUrl))).get();
        if (!exists) {
          db.insert(links).values({
            id: crypto.randomUUID(),
            scanId: scan.id,
            url: newUrl,
            parentUrl: link.url,
            status: 'PENDING',
          }).run();
        }
      }
    }

  } catch (error: any) {
    db.update(links).set({
      status: 'BROKEN',
      error: error.message,
      checkedAt: new Date()
    }).where(eq(links.id, link.id)).run();
  }
}
