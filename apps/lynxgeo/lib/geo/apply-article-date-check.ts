import { parseScanConfig, type CrawlConfig } from '@lynx/crawler-core';
import { analyzePage } from './analyze';
import { fetchGeoResource, withGeoCloudflareDefaults, type GeoCfConfig } from './cf-unlock';
import { withNewsListingChecked, type CategoryScoresBlob } from './news-listing-prompt';
import { forceGeoSkipExternal, geoPageUrlKey, isGeoHtmlPage } from './origin-scope';
import { aggregateScore, playbook, type Finding } from './score';
import { freezeSnapshot, type FrozenSnapshot } from './snapshot';

export type ArticleDateCheckPageRow = {
  url: string;
  status: string;
  statusCode: number | null;
  findings: Finding[];
  contentType: string | null;
  headers: Record<string, string> | null;
};

export type MergedArticleDateCheck = {
  findings: Finding[];
  pages: FrozenSnapshot['pages'];
  pageRow: ArticleDateCheckPageRow;
  overall: number;
  categories: ReturnType<typeof aggregateScore>['categories'];
  suggestions: ReturnType<typeof playbook>;
  snapshot: FrozenSnapshot;
  categoryBlob: CategoryScoresBlob;
};

/** Drop discovery date gap + prior in-place date-check rows, then append forced article findings. */
export function mergeArticleDateCheckFindings(input: {
  existingFindings: Finding[];
  pageFindings: Finding[];
  articleUrl: string;
}): Finding[] {
  const articleKey = geoPageUrlKey(input.articleUrl);
  const kept = input.existingFindings.filter((f) => {
    if (f.id === 'date-unidentified' || f.id === 'date-check-listing') return false;
    if (typeof f.id === 'string' && f.id.startsWith('date-') && f.url && geoPageUrlKey(f.url) === articleKey) {
      return false;
    }
    return true;
  });

  const dateFinding = input.pageFindings.find((f) => typeof f.id === 'string' && f.id.startsWith('date-'));
  const summarySeverity = dateFinding?.severity === 'pass' ? 'pass' : 'warn';

  return [
    ...kept,
    ...input.pageFindings,
    {
      id: 'date-check-listing',
      category: 'citeability',
      title: 'Date check of user-supplied article',
      detail: `Checked date markup on user-supplied article ${articleKey}.`,
      severity: summarySeverity,
      standard: 'established',
      suggestion:
        summarySeverity === 'pass'
          ? ''
          : 'Add visible <time datetime>, Open Graph article:published_time / article:modified_time, and/or Schema.org datePublished / dateModified on the article page.',
      url: articleKey,
    },
  ];
}

export function buildMergedArticleDateCheck(input: {
  snapshot: FrozenSnapshot;
  pageFindings: Finding[];
  articleUrl: string;
  pageStatus: string;
  statusCode: number | null;
  contentType: string | null;
  headers: Record<string, string> | null;
  previousCategoryBlob: CategoryScoresBlob;
}): MergedArticleDateCheck {
  const articleKey = geoPageUrlKey(input.articleUrl);
  const findings = mergeArticleDateCheckFindings({
    existingFindings: input.snapshot.findings || [],
    pageFindings: input.pageFindings,
    articleUrl: articleKey,
  });
  const { overall, categories, agentReadiness } = aggregateScore(findings);
  const suggestions = playbook(findings);
  const pages = [...(input.snapshot.pages || [])];
  if (!pages.some((p) => geoPageUrlKey(p.url) === articleKey)) {
    pages.push({ url: articleKey, status: input.pageStatus, statusCode: input.statusCode });
  } else {
    for (let i = 0; i < pages.length; i += 1) {
      if (geoPageUrlKey(pages[i].url) === articleKey) {
        pages[i] = { url: articleKey, status: input.pageStatus, statusCode: input.statusCode };
      }
    }
  }

  const snapshot = freezeSnapshot({
    score: overall,
    categories,
    agentReadiness,
    findings,
    playbook: suggestions,
    pages,
  });

  const categoryBlob = withNewsListingChecked(
    { ...input.previousCategoryBlob, ...categories, playbook: suggestions, agentReadiness },
    articleKey,
  );

  return {
    findings,
    pages,
    pageRow: {
      url: articleKey,
      status: input.pageStatus,
      statusCode: input.statusCode,
      findings: input.pageFindings,
      contentType: input.contentType,
      headers: input.headers,
    },
    overall,
    categories,
    suggestions,
    snapshot,
    categoryBlob,
  };
}

export async function fetchAndAnalyzeArticleDateCheck(input: {
  articleUrl: string;
  auditId: string;
  configJson: string;
  log?: (line: string) => void;
}): Promise<{
  pageFindings: Finding[];
  pageStatus: string;
  statusCode: number | null;
  contentType: string | null;
  headers: Record<string, string> | null;
  articleUrl: string;
}> {
  const articleUrl = geoPageUrlKey(input.articleUrl);
  let config: GeoCfConfig = withGeoCloudflareDefaults(
    forceGeoSkipExternal(parseScanConfig(input.configJson) as CrawlConfig),
  );
  config = { ...config, excludeSubdomains: false } as GeoCfConfig;

  const unlocked = await fetchGeoResource(articleUrl, config, input.auditId, input.log);
  const resource = unlocked.resource;
  const html = resource.bodyText && (resource.contentType || '').includes('html') ? resource.bodyText : null;

  if (resource.blockedBySsrf) {
    throw new Error('Article URL was blocked by fetch policy (SSRF protection)');
  }
  if (!isGeoHtmlPage(resource, html)) {
    throw new Error('Article URL did not return an HTML page');
  }

  const pageFindings = analyzePage(resource, html, { forceArticleLike: true });
  const pageStatus = resource.ok ? 'SUCCESS' : 'BROKEN';
  return {
    pageFindings,
    pageStatus,
    statusCode: resource.statusCode,
    contentType: resource.contentType,
    headers: (resource.headers as Record<string, string> | null) || null,
    articleUrl,
  };
}
