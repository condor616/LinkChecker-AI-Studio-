import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { discoverLinks, getSkipReason, isTargetedScanConfig, parseScanConfig, type CrawlConfig } from '@lynx/crawler-core';
import { getLynxGeoDbName } from '@lynx/db';
import { getGeoDb, postgresTarget } from '../db';
import { auditPages, auditSnapshots, audits } from '../db/schema';
import { analyzePage } from './analyze';
import { fetchGeoResource, withGeoCloudflareDefaults, type GeoCfConfig } from './cf-unlock';
import { isFlareSolverrConfigured } from './flaresolverr';
import {
  AuditControlSignal,
  AUDIT_FRONTIER_ALTER_SQL,
  buildFrontier,
  isStopStatus,
  parseFrontier,
  serializeFrontier,
  type AuditFrontier,
  type FrontierItem,
} from './frontier';
import {
  filterGeoEnqueueableLinks,
  forceGeoSkipExternal,
  geoPageUrlKey,
  geoStartPathPrefix,
  isDateCheckPinnedTarget,
  isGeoHtmlPage,
  isGeoNonHtmlTarget,
  isGeoExternalUrl,
  isGeoOutOfScopeUrl,
} from './origin-scope';
import { DEFAULT_MAX_DATE_CHECK_URLS, articleSectionPrefix, extractNewsListingLinks } from './news-listing';
import { withNewsListingPending } from './news-listing-prompt';
import { runSiteProbes } from './probes';
import {
  AUDIT_PROGRESS_ALTER_SQL,
  buildAuditProgress,
  resolveAuditMaxPages,
  type AuditPhase,
} from './progress';
import { AUDIT_SERIES_ALTER_SQL } from './series';
import { aggregateScore, playbook, SCORE_MODEL_VERSION, type Finding } from './score';
import { freezeSnapshot } from './snapshot';

/** Persist crawl progress at least this often so the report page is not stuck on a stale URL. */
const PROGRESS_EVERY_N_PAGES = 1;

function pageLogLabel(fetched: number, cap: number): string {
  return cap > 0 ? `${fetched}/${cap}` : String(fetched);
}

export type AuditLog = (line: string) => void;

export type AuditBullProgress = {
  phase: AuditPhase;
  pagesFetched: number;
  maxPages: number;
  currentUrl: string | null;
  queuedRemaining?: number;
};

export type AuditRunOutcome = 'completed' | 'paused' | 'cancelled';

export async function runAudit(
  userId: string,
  auditId: string,
  log: AuditLog = console.log,
  onBullProgress?: (data: AuditBullProgress) => void | Promise<void>,
): Promise<AuditRunOutcome> {
  const geoDbName = getLynxGeoDbName(userId);
  const geoDb = getGeoDb(userId);
  await geoDb.execute(AUDIT_PROGRESS_ALTER_SQL);
  await geoDb.execute(AUDIT_FRONTIER_ALTER_SQL);
  await geoDb.execute(AUDIT_SERIES_ALTER_SQL);
  let audit: typeof audits.$inferSelect | undefined;
  for (let attempt = 1; attempt <= 5; attempt++) {
    [audit] = await geoDb.select().from(audits).where(eq(audits.id, auditId)).limit(1);
    if (audit) break;
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!audit) {
    log(`audit ${auditId} not found for user ${userId} db=${geoDbName} postgres=${postgresTarget()}`);
    throw new Error(`Audit ${auditId} not found for user ${userId} (db=${geoDbName} postgres=${postgresTarget()})`);
  }

  if (audit.status === 'CANCELLED') {
    log(`audit ${auditId} already CANCELLED — skipping`);
    return 'cancelled';
  }
  if (audit.status === 'PAUSED') {
    log(`audit ${auditId} is PAUSED — skipping until resume`);
    return 'paused';
  }
  if (audit.status === 'COMPLETED') {
    log(`audit ${auditId} already COMPLETED — skipping`);
    return 'completed';
  }

  let pagesFetched = 0;
  let pageCap = 0;
  const saved = parseFrontier(audit.frontier);
  let probesDone = saved?.probesDone ?? false;
  let probeFindings: Finding[] = saved?.probeFindings ? [...saved.probeFindings] : [];
  let queue: FrontierItem[] = saved?.queue?.length
    ? saved.queue.map((item) => ({ ...item }))
    : [{ url: '', depth: 0, parentUrl: null }];
  const seen = new Set<string>(saved?.seen ?? []);
  const persistProgress = async (phase: AuditPhase, currentUrl: string | null = null) => {
    const payload = buildAuditProgress({
      phase,
      pagesFetched,
      maxPages: pageCap,
      currentUrl,
      queuedRemaining: queue.length,
    });
    await geoDb
      .update(audits)
      .set({ progress: JSON.stringify(payload), updatedAt: new Date() })
      .where(eq(audits.id, auditId));
    await onBullProgress?.({
      phase,
      pagesFetched,
      maxPages: pageCap,
      currentUrl,
      queuedRemaining: queue.length,
    });
  };

  const snapshotFrontier = (phase: AuditFrontier['phase']): AuditFrontier =>
    buildFrontier({
      probesDone,
      queue,
      seen,
      pagesFetched,
      phase,
      probeFindings,
    });

  const persistFrontier = async (phase: AuditFrontier['phase']) => {
    await geoDb
      .update(audits)
      .set({ frontier: serializeFrontier(snapshotFrontier(phase)), updatedAt: new Date() })
      .where(eq(audits.id, auditId));
  };

  const clearFrontier = async () => {
    await geoDb.update(audits).set({ frontier: null, updatedAt: new Date() }).where(eq(audits.id, auditId));
  };

  const assertStillRunning = async () => {
    const [row] = await geoDb.select({ status: audits.status }).from(audits).where(eq(audits.id, auditId)).limit(1);
    const status = row?.status;
    if (isStopStatus(status)) {
      throw new AuditControlSignal(status);
    }
  };

  const handleControl = async (control: 'PAUSED' | 'CANCELLED'): Promise<AuditRunOutcome> => {
    if (control === 'PAUSED') {
      await persistFrontier(probesDone ? 'crawl' : 'probes');
      await persistProgress(probesDone ? 'crawl' : 'probes', queue[0]?.url ?? null);
      log(`audit ${auditId} PAUSED pages=${pagesFetched} queued=${queue.length}`);
      return 'paused';
    }
    await clearFrontier();
    log(`audit ${auditId} CANCELLED pages=${pagesFetched} — no snapshot`);
    return 'cancelled';
  };

  try {
    let config: GeoCfConfig = withGeoCloudflareDefaults(
      forceGeoSkipExternal(parseScanConfig(audit.config) as CrawlConfig),
    );
    const isTargeted = isTargetedScanConfig(config);
    const dateCheckFromListing = Boolean((config as Record<string, unknown>).dateCheckFromListing);
    const dateCheckSingleArticle = Boolean((config as Record<string, unknown>).dateCheckSingleArticle);
    const dateCheckListingUrl = String((config as Record<string, unknown>).dateCheckListingUrl || '');
    const dateCheckArticleUrl = String(
      (config as Record<string, unknown>).dateCheckArticleUrl ||
        (dateCheckSingleArticle ? (config.targetUrls || [])[0] || '' : ''),
    );
    const maxDateCheckUrls = Math.min(
      DEFAULT_MAX_DATE_CHECK_URLS,
      Math.max(
        1,
        Number((config as Record<string, unknown>).maxDateCheckUrls) || DEFAULT_MAX_DATE_CHECK_URLS,
      ),
    );
    let listingExpanded = false;
    const pinnedDateCheckTargets = dateCheckSingleArticle
      ? (config.targetUrls || []).map((url) => geoPageUrlKey(url))
      : dateCheckArticleUrl
        ? [geoPageUrlKey(dateCheckArticleUrl)]
        : [];
    const origin = new URL(config.startUrl).origin;
    const pathPrefix = geoStartPathPrefix(config.startUrl);
    const startPageUrl = geoPageUrlKey(config.startUrl);
    const maxDepth = config.maxDepth ?? 2;
    pageCap = resolveAuditMaxPages((config as CrawlConfig & { maxPages?: unknown }).maxPages);
    const depthNote = maxDepth === 0 ? '0 (unlimited)' : String(maxDepth);
    const capNote = pageCap === 0 ? '0 (unlimited)' : String(pageCap);
    const rateLimit = typeof config.rateLimit === 'number' && config.rateLimit > 0 ? config.rateLimit : 0;
    const ua = (config.customUserAgent || config.userAgent || 'default').slice(0, 80);
    log(
      `audit ${auditId} startUrl=${config.startUrl} origin=${origin} pathPrefix=${pathPrefix} maxDepth=${depthNote} maxPages=${capNote} skipExternal=true stayInStartPath=true rateLimit=${rateLimit || 'off'} ua=${ua} targeted=${isTargeted} dateCheckFromListing=${dateCheckFromListing} dateCheckSingleArticle=${dateCheckSingleArticle} bypassCloudflare=${Boolean(config.bypassCloudflare)} flaresolverr=${isFlareSolverrConfigured()}`,
    );

    if (!saved?.queue?.length) {
      if (dateCheckSingleArticle && dateCheckArticleUrl) {
        queue = [{ url: geoPageUrlKey(dateCheckArticleUrl), depth: 0, parentUrl: null }];
        pageCap = 1;
      } else if (dateCheckFromListing && dateCheckListingUrl) {
        queue = [{ url: geoPageUrlKey(dateCheckListingUrl), depth: 0, parentUrl: null }];
        pageCap = 1;
        listingExpanded = false;
      } else if (isTargeted) {
        const targetUrls = (config.targetUrls || []).map((url) => geoPageUrlKey(url));
        queue = targetUrls.map((url) => ({ url, depth: 0, parentUrl: null }));
        pageCap = targetUrls.length;
      } else {
        queue = [{ url: startPageUrl, depth: 0, parentUrl: null }];
      }
    }

    await assertStillRunning();

    const findings: Finding[] = [...probeFindings];

    if (probesDone) {
      log(`resuming crawl from frontier queue=${queue.length} seen=${seen.size} probeFindings=${probeFindings.length}`);
      const storedPages = await geoDb.select().from(auditPages).where(eq(auditPages.auditId, auditId));
      for (const page of storedPages) {
        seen.add(geoPageUrlKey(page.url));
        try {
          const extra = JSON.parse(page.findings || '[]');
          if (Array.isArray(extra)) {
            // Drop legacy exclusion warns so resumed audits do not score them.
            findings.push(
              ...(extra as Finding[]).filter((f) => !(typeof f?.id === 'string' && f.id.startsWith('excluded-'))),
            );
          }
        } catch {
          // ignore malformed stored findings
        }
      }
      listingExpanded = dateCheckFromListing && findings.some((f) => f.id === 'date-check-listing');
    } else {
      log(`site probes starting for ${origin} (first fetch ${new URL('/robots.txt', origin).toString()})`);
      probeFindings = [
        ...(await runSiteProbes(
          origin,
          config,
          log,
          (phase, url) => persistProgress(phase, url),
          assertStillRunning,
          auditId,
          (next) => {
            config = next;
          },
        )),
      ];
      findings.push(...probeFindings);
      probesDone = true;
      log(`site probes finished (${probeFindings.length} findings)`);
      await persistFrontier('crawl');
    }

    const pageRows: { url: string; status: string; statusCode: number | null }[] = [];
    const storedForRows = await geoDb.select().from(auditPages).where(eq(auditPages.auditId, auditId));
    for (const page of storedForRows) {
      pageRows.push({ url: page.url, status: page.status, statusCode: page.statusCode });
    }

    let htmlPagesAnalyzed = 0;
    let articleLikePages = 0;
    for (const f of findings) {
      if (typeof f?.id === 'string' && f.id.startsWith('date-')) articleLikePages += 1;
    }

    pagesFetched = seen.size || pageRows.length;
    await persistProgress('crawl', queue[0]?.url ?? startPageUrl);

    while (queue.length && (pageCap === 0 || seen.size < pageCap)) {
      await assertStillRunning();
      const item = queue.shift()!;
      const pageUrl = geoPageUrlKey(item.url);
      if (seen.has(pageUrl)) continue;
      const pinnedDateTarget =
        dateCheckSingleArticle && isDateCheckPinnedTarget(pageUrl, pinnedDateCheckTargets);
      if (!pinnedDateTarget && isGeoOutOfScopeUrl(pageUrl, config)) {
        log(isGeoExternalUrl(pageUrl, config) ? `ignored off-origin ${pageUrl}` : `ignored off-path ${pageUrl}`);
        continue;
      }
      if (isGeoNonHtmlTarget(pageUrl)) {
        log(`ignored document ${pageUrl}`);
        continue;
      }
      item.url = pageUrl;
      seen.add(pageUrl);
      pagesFetched = seen.size;
      if (seen.size === 1 || seen.size % PROGRESS_EVERY_N_PAGES === 0) {
        await persistProgress('crawl', item.url);
      }

      const skip = pinnedDateTarget ? null : getSkipReason(item.url, config);
      if (skip) {
        log(`page ${pageLogLabel(seen.size, pageCap)} SKIPPED ${item.url} (${skip})`);
        if (isGeoExternalUrl(item.url, config)) {
          await persistFrontier('crawl');
          continue;
        }
        if (config.saveSkippedLinks === false) {
          pageRows.push({ url: item.url, status: 'SKIPPED', statusCode: null });
          await persistFrontier('crawl');
          continue;
        }
        // Record the skip for the page list, but do not emit a warn finding —
        // user-configured exclusions are intentional skips, not crawl-access issues.
        await geoDb.insert(auditPages).values({
          id: randomUUID(),
          auditId,
          url: item.url,
          parentUrl: item.parentUrl,
          status: 'SKIPPED',
          statusCode: null,
          depth: item.depth,
          contentType: null,
          headers: null,
          findings: JSON.stringify([]),
          checkedAt: new Date(),
        });
        pageRows.push({ url: item.url, status: 'SKIPPED', statusCode: null });
        await persistFrontier('crawl');
        continue;
      }

      if (rateLimit) {
        await new Promise((resolve) => setTimeout(resolve, Math.ceil(60_000 / rateLimit)));
        await assertStillRunning();
      }
      const unlocked = await fetchGeoResource(item.url, config, auditId, log);
      config = unlocked.config;
      const resource = unlocked.resource;
      const html = resource.bodyText && (resource.contentType || '').includes('html') ? resource.bodyText : null;
      if (!isGeoHtmlPage(resource, html)) {
        log(`page ${pageLogLabel(seen.size, pageCap)} SKIPPED document ${item.url}`);
        pageRows.push({ url: item.url, status: 'SKIPPED', statusCode: resource.statusCode });
        await persistFrontier('crawl');
        continue;
      }

      const isListingSeed =
        dateCheckFromListing &&
        !listingExpanded &&
        geoPageUrlKey(item.url) === geoPageUrlKey(dateCheckListingUrl || item.url);

      if (isListingSeed) {
        const links = extractNewsListingLinks(html || '', item.url, {
          maxUrls: maxDateCheckUrls,
          articleUrl: dateCheckArticleUrl || undefined,
        });
        const sectionPrefix = dateCheckArticleUrl ? articleSectionPrefix(dateCheckArticleUrl) : null;
        const listingFindings = analyzePage(resource, html);
        findings.push(...listingFindings);
        htmlPagesAnalyzed += 1;
        if (listingFindings.some((f) => f.id.startsWith('date-'))) articleLikePages += 1;

        const status = resource.blockedBySsrf ? 'SKIPPED' : resource.ok ? 'SUCCESS' : 'BROKEN';
        log(
          `page ${pageLogLabel(seen.size, pageCap)} ${status} HTTP ${resource.statusCode ?? 'n/a'} listing ${item.url} links=${links.length} article=${dateCheckArticleUrl || 'n/a'} prefix=${sectionPrefix || 'n/a'}`,
        );
        await geoDb.insert(auditPages).values({
          id: randomUUID(),
          auditId,
          url: item.url,
          parentUrl: item.parentUrl,
          status,
          statusCode: resource.statusCode,
          depth: item.depth,
          contentType: resource.contentType,
          headers: JSON.stringify(resource.headers),
          findings: JSON.stringify(listingFindings),
          checkedAt: new Date(),
        });
        pageRows.push({ url: item.url, status, statusCode: resource.statusCode });

        const onlySample =
          links.length === 1 &&
          dateCheckArticleUrl &&
          geoPageUrlKey(links[0]) === geoPageUrlKey(dateCheckArticleUrl);
        findings.push({
          id: 'date-check-listing',
          category: 'citeability',
          title: links.length
            ? 'Date check from news listing'
            : 'News listing had no matching article links',
          detail: links.length
            ? `Listing ${item.url} + sample ${dateCheckArticleUrl || '(none)'}: queued ${links.length} page(s) under section ${sectionPrefix || '(n/a)'} for date markup checks (cap ${maxDateCheckUrls}; nav/header/footer excluded).`
            : `Listing ${item.url} + sample ${dateCheckArticleUrl || '(none)'}: no same-origin links matched section ${sectionPrefix || '(n/a)'} after excluding site chrome.`,
          severity: links.length ? 'pass' : 'warn',
          standard: 'established',
          suggestion: links.length
            ? onlySample
              ? `Only the sample article matched. Confirm other news items on ${item.url} share the path section ${sectionPrefix}.`
              : ''
            : `Confirm the sample article URL is a news item linked from ${item.url} (or in the same path section), then try again.`,
          url: item.url,
        });

        queue = links.map((url) => ({ url, depth: 0, parentUrl: item.url }));
        pageCap = seen.size + queue.length;
        listingExpanded = true;
        await persistFrontier('crawl');
        continue;
      }

      const forceArticleLike =
        (dateCheckFromListing && listingExpanded) || dateCheckSingleArticle;
      const pageFindings = analyzePage(resource, html, { forceArticleLike });
      findings.push(...pageFindings);
      htmlPagesAnalyzed += 1;
      if (pageFindings.some((f) => f.id.startsWith('date-'))) articleLikePages += 1;
      const status = resource.blockedBySsrf ? 'SKIPPED' : resource.ok ? 'SUCCESS' : 'BROKEN';
      log(
        `page ${pageLogLabel(seen.size, pageCap)} ${status} HTTP ${resource.statusCode ?? 'n/a'} ${item.url} findings=${pageFindings.length}${forceArticleLike ? ' forceDate=1' : ''}`,
      );

      if (dateCheckSingleArticle && pinnedDateTarget) {
        findings.push({
          id: 'date-check-listing',
          category: 'citeability',
          title: 'Date check of user-supplied article',
          detail: dateCheckListingUrl
            ? `Checked date markup on user-supplied article ${item.url} (listing context: ${dateCheckListingUrl}).`
            : `Checked date markup on user-supplied article ${item.url}.`,
          severity: 'pass',
          standard: 'established',
          suggestion: '',
          url: item.url,
        });
      }

      await geoDb.insert(auditPages).values({
        id: randomUUID(),
        auditId,
        url: item.url,
        parentUrl: item.parentUrl,
        status,
        statusCode: resource.statusCode,
        depth: item.depth,
        contentType: resource.contentType,
        headers: JSON.stringify(resource.headers),
        findings: JSON.stringify(pageFindings),
        checkedAt: new Date(),
      });
      pageRows.push({ url: item.url, status, statusCode: resource.statusCode });

      if (
        !isTargeted &&
        !dateCheckFromListing &&
        !dateCheckSingleArticle &&
        html &&
        (maxDepth === 0 || item.depth < maxDepth)
      ) {
        const discovered = discoverLinks(html, item.url, config, item.depth);
        const inScope = filterGeoEnqueueableLinks(discovered, config, seen);
        const droppedOffOrigin = discovered.filter((link) => isGeoExternalUrl(geoPageUrlKey(link.url), config)).length;
        const droppedOffPath = discovered.filter((link) => {
          const url = geoPageUrlKey(link.url);
          return !isGeoExternalUrl(url, config) && isGeoOutOfScopeUrl(url, config);
        }).length;
        let enqueued = 0;
        for (const link of inScope) {
          if (!seen.has(link.url) && (pageCap === 0 || queue.length + seen.size < pageCap)) {
            queue.push({ url: link.url, depth: link.depth, parentUrl: item.url });
            enqueued += 1;
          }
        }
        if (enqueued || droppedOffOrigin || droppedOffPath) {
          log(
            `discovered ${discovered.length} links, queued ${enqueued}, ignored ${droppedOffOrigin} off-origin, ignored ${droppedOffPath} off-path from ${item.url}`,
          );
        }
      }
      await persistFrontier('crawl');
    }

    await assertStillRunning();

    if (
      !dateCheckFromListing &&
      !dateCheckSingleArticle &&
      htmlPagesAnalyzed > 0 &&
      articleLikePages === 0
    ) {
      findings.push({
        id: 'date-unidentified',
        category: 'citeability',
        title: 'Could not detect news pages for date metatags',
        detail: `We could not detect news/article pages on this crawl (no og:type=article and no Schema.org Article/NewsArticle/BlogPosting/TechArticle among ${htmlPagesAnalyzed} HTML page(s)), so we could not determine whether date metatags are present.`,
        severity: 'warn',
        standard: 'established',
        suggestion:
          'Provide a sample news article URL on the audit report (Check), or Cancel to skip. Living pages still use sitemap lastmod and HTTP Last-Modified for freshness.',
      });
    }

    pagesFetched = pageRows.length;
    await persistProgress('scoring', null);
    const { overall, categories, agentReadiness } = aggregateScore(findings);
    const suggestions = playbook(findings);
    await persistProgress('snapshot', null);
    const snapshot = freezeSnapshot({
      score: overall,
      categories,
      agentReadiness,
      findings,
      playbook: suggestions,
      pages: pageRows,
    });

    const needsNewsListing =
      !dateCheckFromListing &&
      !dateCheckSingleArticle &&
      htmlPagesAnalyzed > 0 &&
      articleLikePages === 0;
    const categoryBlob = needsNewsListing
      ? withNewsListingPending({ ...categories, playbook: suggestions, agentReadiness })
      : { ...categories, playbook: suggestions, agentReadiness };

    const doneProgress = buildAuditProgress({
      phase: 'done',
      pagesFetched,
      maxPages: pageCap,
      currentUrl: null,
      queuedRemaining: 0,
    });
    await geoDb
      .update(audits)
      .set({
        status: 'COMPLETED',
        score: overall,
        scoreModelVersion: SCORE_MODEL_VERSION,
        categoryScores: JSON.stringify(categoryBlob),
        progress: JSON.stringify(doneProgress),
        frontier: null,
        updatedAt: new Date(),
      })
      .where(eq(audits.id, auditId));

    await geoDb.insert(auditSnapshots).values({
      id: randomUUID(),
      auditId,
      score: overall,
      scoreModelVersion: SCORE_MODEL_VERSION,
      payload: JSON.stringify(snapshot),
      createdAt: new Date(),
    });
    await onBullProgress?.({
      phase: 'done',
      pagesFetched,
      maxPages: pageCap,
      currentUrl: null,
      queuedRemaining: 0,
    });
    log(
      `audit ${auditId} COMPLETED score=${overall} pages=${pageRows.length} findings=${findings.length} suggestions=${suggestions.length} needsNewsListing=${needsNewsListing}`,
    );
    return 'completed';
  } catch (error: any) {
    if (error instanceof AuditControlSignal) {
      return handleControl(error.control);
    }
    const [row] = await geoDb.select({ status: audits.status }).from(audits).where(eq(audits.id, auditId)).limit(1);
    if (isStopStatus(row?.status)) {
      return handleControl(row.status);
    }
    log(`audit ${auditId} FAILED: ${error?.message || error}`);
    await geoDb
      .update(audits)
      .set({ status: 'FAILED', updatedAt: new Date() })
      .where(eq(audits.id, auditId));
    throw error;
  }
}
