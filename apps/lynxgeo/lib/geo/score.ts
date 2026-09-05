import { isGeoNonHtmlTarget } from './document-url';

export const SCORE_MODEL_VERSION = 'geo-1.2.0';

export type FindingSeverity = 'pass' | 'warn' | 'fail';
export type FindingStandard = 'established' | 'convention' | 'emerging';
export type FindingCategory = 'crawlAccess' | 'extractability' | 'negotiation' | 'discovery' | 'citeability';
export type CriterionScope = 'site' | 'page';

export type Finding = {
  id: string;
  category: FindingCategory;
  title: string;
  detail: string;
  severity: FindingSeverity;
  standard: FindingStandard;
  suggestion: string;
  url?: string;
};

/** Actionable playbook row: one finding type, optionally rolled up across pages. */
export type PlaybookItem = Finding & {
  urls: string[];
  count: number;
};

export type CategoryScores = {
  crawlAccess: number;
  extractability: number;
  negotiation: number;
  discovery: number;
  citeability: number;
};

export const CATEGORY_WEIGHTS: Record<FindingCategory, number> = {
  crawlAccess: 0.28,
  extractability: 0.28,
  negotiation: 0.18,
  discovery: 0.16,
  citeability: 0.1,
};

/** Points one observation (or one page in a rate) contributes before category averaging. */
export const SEVERITY_POINTS: Record<FindingSeverity, number> = {
  pass: 100,
  warn: 70,
  fail: 25,
};

/** Vote weight inside a category. Convention/emerging cannot dominate established checks. */
export const STANDARD_WEIGHT: Record<FindingStandard, number> = {
  established: 1,
  convention: 0.4,
  emerging: 0.2,
};

export const AI_SEARCH_BOT_GROUP = 'ai-search-bots';

export type CriterionDefinition = {
  key: string;
  title: string;
  category: FindingCategory;
  standard: FindingStandard;
  scope: CriterionScope;
  /** Typical severity when the check does not pass. */
  issueSeverity: FindingSeverity;
  /** Scoring bucket; several keys can share one vote (AI search bots). */
  scoreGroup: string;
  /** Page check emitted only on issues; other crawled pages count as pass. */
  sparse?: boolean;
  /** Shown on the report, excluded from the numeric score. */
  informational?: boolean;
  why: string;
};

export const CATEGORY_META: Record<FindingCategory, { label: string; weight: number; summary: string }> = {
  crawlAccess: {
    label: 'Crawl access',
    weight: CATEGORY_WEIGHTS.crawlAccess,
    summary: 'Can AI search crawlers retrieve public HTML? robots.txt, search bots, sitemaps, and fetch failures.',
  },
  extractability: {
    label: 'Extractability',
    weight: CATEGORY_WEIGHTS.extractability,
    summary:
      'Is the HTML structured so an agent can parse the page? Headings, canonical, language, JSON-LD presence, and schema.org vocabulary checks.',
  },
  negotiation: {
    label: 'Negotiation',
    weight: CATEGORY_WEIGHTS.negotiation,
    summary: 'Can clients ask for markdown (Accept / Vary) and is a markdown alternate advertised?',
  },
  discovery: {
    label: 'Discovery',
    weight: CATEGORY_WEIGHTS.discovery,
    summary: 'Optional agent maps (llms.txt, mcp.json, TDMRep). These are not Google ranking factors.',
  },
  citeability: {
    label: 'Citeability',
    weight: CATEGORY_WEIGHTS.citeability,
    summary: 'Signals that make a page quotable: HTTPS, titles, dates, lean HTML. 10% of the overall score.',
  },
};

export const CRITERION_CATALOG: CriterionDefinition[] = [
  {
    key: 'robots',
    title: 'robots.txt',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'fail',
    scoreGroup: 'robots',
    why: 'Search and AI crawlers look up robots.txt first. A reachable file is the established way to allow or deny bots.',
  },
  {
    key: 'bot-GPTBot',
    title: 'GPTBot',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'fail',
    scoreGroup: AI_SEARCH_BOT_GROUP,
    why: 'OpenAI’s GPTBot crawls pages that may be cited in ChatGPT search-style answers. Disallowing it hides public content from that channel.',
  },
  {
    key: 'bot-OAI-SearchBot',
    title: 'OAI-SearchBot',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'fail',
    scoreGroup: AI_SEARCH_BOT_GROUP,
    why: 'OpenAI’s search crawler. Scored with the other AI search bots as one rate, not five full votes.',
  },
  {
    key: 'bot-ChatGPT-User',
    title: 'ChatGPT-User',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'fail',
    scoreGroup: AI_SEARCH_BOT_GROUP,
    why: 'User-initiated fetches from ChatGPT. Blocking it prevents live browsing of public pages in that product.',
  },
  {
    key: 'bot-ClaudeBot',
    title: 'ClaudeBot',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'fail',
    scoreGroup: AI_SEARCH_BOT_GROUP,
    why: 'Anthropic’s crawler. Allow it on public pages you want eligible for Claude-cited answers.',
  },
  {
    key: 'bot-PerplexityBot',
    title: 'PerplexityBot',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'fail',
    scoreGroup: AI_SEARCH_BOT_GROUP,
    why: 'Perplexity’s crawler. Same AI search-bot rate as GPTBot and ClaudeBot.',
  },
  {
    key: 'bot-Bingbot',
    title: 'Bingbot',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'fail',
    scoreGroup: AI_SEARCH_BOT_GROUP,
    why: 'Microsoft Bing’s crawler underpins Copilot citation. Scored with the other AI search bots as one rate.',
  },
  {
    key: 'bot-Meta-ExternalAgent',
    title: 'Meta-ExternalAgent',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'fail',
    scoreGroup: AI_SEARCH_BOT_GROUP,
    why: 'Meta’s external agent crawler for Meta AI / Llama citation. Same AI search-bot rate.',
  },
  {
    key: 'bot-Amazonbot',
    title: 'Amazonbot',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'fail',
    scoreGroup: AI_SEARCH_BOT_GROUP,
    why: 'Amazon’s crawler used by Alexa+ / Rufus-style answers. Same AI search-bot rate.',
  },
  {
    key: 'bot-YouBot',
    title: 'YouBot',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'fail',
    scoreGroup: AI_SEARCH_BOT_GROUP,
    why: 'you.com’s crawler. Same AI search-bot rate as GPTBot and ClaudeBot.',
  },
  {
    key: 'bot-Googlebot',
    title: 'Googlebot (Search)',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'fail',
    scoreGroup: 'bot-Googlebot',
    why: 'Googlebot is Search (including AI Overviews that use Search). It is scored separately from Google-Extended (training).',
  },
  {
    key: 'train-Google-Extended',
    title: 'Google-Extended (training)',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'pass',
    scoreGroup: 'training-bots',
    informational: true,
    why: 'Google-Extended controls Gemini training, not Search. Reported separately from Googlebot. Allowing or blocking it does not change the score — that is a policy choice.',
  },
  {
    key: 'train-CCBot',
    title: 'CCBot (training)',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'pass',
    scoreGroup: 'training-bots',
    informational: true,
    why: 'Common Crawl’s bot. Training-oriented; shown for policy, not scored.',
  },
  {
    key: 'train-Bytespider',
    title: 'Bytespider (training)',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'pass',
    scoreGroup: 'training-bots',
    informational: true,
    why: 'ByteDance training crawler. Reported separately from AI search bots; not scored.',
  },
  {
    key: 'train-Applebot-Extended',
    title: 'Applebot-Extended (training)',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'pass',
    scoreGroup: 'training-bots',
    informational: true,
    why: 'Apple Intelligence training opt-out token (distinct from Applebot search). Reported for policy, not scored.',
  },
  {
    key: 'train-Diffbot',
    title: 'Diffbot (training)',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'pass',
    scoreGroup: 'training-bots',
    informational: true,
    why: 'Diffbot training / extraction crawler. Reported separately from AI search bots; not scored.',
  },
  {
    key: 'sitemap',
    title: 'sitemap.xml',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'warn',
    scoreGroup: 'sitemap',
    why: 'A sitemap helps search engines and agents discover URLs. Missing is a warning, not a hard fail — many sites list URLs only via links.',
  },
  {
    key: 'noindex',
    title: 'robots noindex',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'page',
    issueSeverity: 'fail',
    scoreGroup: 'noindex',
    sparse: true,
    why: 'noindex tells crawlers not to include the page in search. Only pages that set it fail; other crawled pages count as pass.',
  },
  {
    key: 'noai',
    title: 'noai / noimageai',
    category: 'crawlAccess',
    standard: 'convention',
    scope: 'page',
    issueSeverity: 'pass',
    scoreGroup: 'noai',
    sparse: true,
    informational: true,
    why: 'Publisher opt-out for AI training via meta robots or X-Robots-Tag (noai / noimageai). Reported for policy awareness; does not change the score.',
  },
  {
    key: 'wall',
    title: 'Consent / JS wall',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'page',
    issueSeverity: 'fail',
    scoreGroup: 'wall',
    sparse: true,
    why: 'Thin HTML that only asks for cookies or JavaScript hides the real article from non-JS agents. Fail on those pages only.',
  },
  {
    key: 'http',
    title: 'HTTP response',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'page',
    issueSeverity: 'fail',
    scoreGroup: 'http',
    sparse: true,
    why: '4xx/5xx (or fetch errors) mean the page cannot be read. Auth-gated URLs warn instead of fail. Successful fetches count as pass.',
  },
  {
    key: 'ssrf',
    title: 'SSRF policy',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'page',
    issueSeverity: 'fail',
    scoreGroup: 'ssrf',
    sparse: true,
    why: 'The auditor will not fetch private/internal hosts. Use staging Basic Auth for those URLs rather than exposing them.',
  },
  {
    key: 'excluded',
    title: 'Crawl exclusion',
    category: 'crawlAccess',
    standard: 'established',
    scope: 'page',
    issueSeverity: 'pass',
    scoreGroup: 'excluded',
    sparse: true,
    informational: true,
    why: 'URL matched a crawl skip rule (file type, path, etc.). Skipped pages are not audited and are not scored as crawl-access failures.',
  },
  {
    key: 'h1',
    title: 'H1 heading',
    category: 'extractability',
    standard: 'established',
    scope: 'page',
    issueSeverity: 'warn',
    scoreGroup: 'h1',
    why: 'A clear H1 is the usual outline of the page topic for extractors. Scored as the share of pages that have one.',
  },
  {
    key: 'canonical',
    title: 'Canonical link',
    category: 'extractability',
    standard: 'established',
    scope: 'page',
    issueSeverity: 'warn',
    scoreGroup: 'canonical',
    why: 'rel=canonical reduces duplicate-URL confusion when agents choose a citation target.',
  },
  {
    key: 'lang',
    title: 'html lang',
    category: 'extractability',
    standard: 'established',
    scope: 'page',
    issueSeverity: 'warn',
    scoreGroup: 'lang',
    why: 'html lang (and hreflang on locale variants) helps agents pick the right language/country page.',
  },
  {
    key: 'hreflang',
    title: 'hreflang alternates',
    category: 'extractability',
    standard: 'established',
    scope: 'page',
    issueSeverity: 'warn',
    scoreGroup: 'hreflang',
    sparse: true,
    why: 'Checked on locale-looking URLs (/en, /de, /fr). Missing alternates warn; pages that are not locale-like count as pass.',
  },
  {
    key: 'jsonld',
    title: 'JSON-LD',
    category: 'extractability',
    standard: 'established',
    scope: 'page',
    issueSeverity: 'warn',
    scoreGroup: 'jsonld',
    why: 'Presence of application/ld+json script blocks. Vocabulary correctness is a separate schemaorg check.',
  },
  {
    key: 'schemaorg',
    title: 'Schema.org vocabulary',
    category: 'extractability',
    standard: 'established',
    scope: 'page',
    issueSeverity: 'fail',
    scoreGroup: 'schemaorg',
    sparse: true,
    why: 'When JSON-LD is present, types and properties must match the pinned official schema.org vocabulary (not a homemade type list). Emitted only on pages with JSON-LD.',
  },
  {
    key: 'schema-rich',
    title: 'Google Rich Results fields',
    category: 'extractability',
    standard: 'convention',
    scope: 'page',
    issueSeverity: 'warn',
    scoreGroup: 'schema-rich',
    sparse: true,
    why: 'Google Rich Results required-property guidance for a small set of types. Warnings are labeled as Google’s docs, not as invalid schema.org.',
  },
  {
    key: 'accept-markdown',
    title: 'Accept: text/markdown',
    category: 'negotiation',
    standard: 'convention',
    scope: 'site',
    issueSeverity: 'warn',
    scoreGroup: 'accept-markdown',
    why: 'Serving text/markdown when Accept prefers it (RFC 9110 / RFC 7763) is a growing agent convention, not a search ranking factor. Weighted as convention (40%).',
  },
  {
    key: 'vary-accept',
    title: 'Vary: Accept',
    category: 'negotiation',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'warn',
    scoreGroup: 'vary-accept',
    why: 'If HTML and Markdown share a URL, Vary: Accept is required so caches do not mix representations. Fail when Markdown is served without Vary; otherwise a warning.',
  },
  {
    key: 'md-alt',
    title: 'Markdown rel=alternate',
    category: 'negotiation',
    standard: 'convention',
    scope: 'page',
    issueSeverity: 'warn',
    scoreGroup: 'md-alt',
    why: 'Optional link rel=alternate type="text/markdown". Convention, scored as a page rate at 40% weight.',
  },
  {
    key: 'llms-txt',
    title: 'llms.txt',
    category: 'discovery',
    standard: 'convention',
    scope: 'site',
    issueSeverity: 'warn',
    scoreGroup: 'llms-txt',
    why: 'llmstxt.org convention: a markdown map of canonical pages. Google Search ignores this file. It is not a ranking promise. Weighted 40% inside discovery.',
  },
  {
    key: 'llms-full',
    title: 'llms-full.txt',
    category: 'discovery',
    standard: 'convention',
    scope: 'site',
    issueSeverity: 'warn',
    scoreGroup: 'llms-full',
    why: 'Optional longer companion to llms.txt. Same convention weight; missing it should not dominate the score.',
  },
  {
    key: 'mcp-json',
    title: 'mcp.json',
    category: 'discovery',
    standard: 'emerging',
    scope: 'site',
    issueSeverity: 'warn',
    scoreGroup: 'mcp-json',
    why: 'Emerging /.well-known/mcp.json discovery file for MCP endpoints. Weighted 20% so an experimental file cannot dominate discovery.',
  },
  {
    key: 'tdmrep',
    title: 'TDMRep',
    category: 'discovery',
    standard: 'emerging',
    scope: 'site',
    issueSeverity: 'warn',
    scoreGroup: 'tdmrep',
    why: 'Emerging TDM Reservation Protocol: /.well-known/tdmrep.json and/or tdm-reservation HTTP header. Weighted 20% so an experimental signal cannot dominate discovery.',
  },
  {
    key: 'https-origin',
    title: 'Origin HTTPS',
    category: 'citeability',
    standard: 'established',
    scope: 'site',
    issueSeverity: 'fail',
    scoreGroup: 'https-origin',
    why: 'The site origin should be HTTPS. One site-level established check, averaged with page citeability rates — not wiped out by per-page date warnings.',
  },
  {
    key: 'title',
    title: 'Page title',
    category: 'citeability',
    standard: 'established',
    scope: 'page',
    issueSeverity: 'fail',
    scoreGroup: 'title',
    why: 'A unique <title> is the usual citation headline. Scored as the pass/fail rate across pages.',
  },
  {
    key: 'date',
    title: 'Date markup',
    category: 'citeability',
    standard: 'established',
    scope: 'page',
    issueSeverity: 'warn',
    scoreGroup: 'date',
    why: 'Looks for <time>, article:published_time, article:modified_time, or meta name=date. Scored as a page rate: 80 pages without dates warn at 70 for this check, not 0 for the whole category.',
  },
  {
    key: 'https',
    title: 'HTTPS',
    category: 'citeability',
    standard: 'established',
    scope: 'page',
    issueSeverity: 'fail',
    scoreGroup: 'https',
    why: 'Each page URL should be HTTPS. Rate across crawled pages, separate from the origin HTTPS probe.',
  },
  {
    key: 'size',
    title: 'HTML document size',
    category: 'citeability',
    standard: 'established',
    scope: 'page',
    issueSeverity: 'warn',
    scoreGroup: 'size',
    sparse: true,
    why: 'Very large HTML (over ~1.5MB) is expensive for agents. Only oversized pages warn; typical pages count as pass.',
  },
];

export const CRITERION_BY_KEY: Map<string, CriterionDefinition> = new Map(
  CRITERION_CATALOG.map((c) => [c.key, c]),
);

export function criterionScoreBlurb(def: CriterionDefinition): string {
  if (def.informational) {
    return 'Reported on the audit; does not change the numeric score.';
  }
  const pts = `Pass contributes ${SEVERITY_POINTS.pass}, warn ${SEVERITY_POINTS.warn}, fail ${SEVERITY_POINTS.fail}`;
  const weight = `${Math.round(STANDARD_WEIGHT[def.standard] * 100)}% category weight (${def.standard})`;
  if (def.scoreGroup === AI_SEARCH_BOT_GROUP) {
    return `Part of the AI search-bot rate (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot) — one established group, not five full votes. ${pts}. ${weight}.`;
  }
  if (def.scope === 'page') {
    const sparse = def.sparse
      ? 'Sparse: pages without this issue count as pass. '
      : 'Scored as the rate of pages that pass, warn, or fail. ';
    return `${sparse}${pts}. ${weight}. Repeating the same page warning cannot zero the category.`;
  }
  return `One site-level observation. ${pts}. ${weight}.`;
}

function rawCriterionScore(pass: number, warn: number, fail: number): number {
  const n = pass + warn + fail;
  if (n <= 0) return 80;
  return (
    (pass * SEVERITY_POINTS.pass + warn * SEVERITY_POINTS.warn + fail * SEVERITY_POINTS.fail) / n
  );
}

function countCrawledPages(findings: Finding[]): number {
  const urls = new Set<string>();
  for (const f of findings) {
    const key = findingCriterionKey(f);
    const def = CRITERION_BY_KEY.get(key);
    const pageScoped = def ? def.scope === 'page' : findingUrls(f).some((u) => f.id.endsWith(u));
    if (!pageScoped) continue;
    for (const u of findingUrls(f)) urls.add(u);
  }
  return urls.size;
}

type ScoreBucket = {
  pass: number;
  warn: number;
  fail: number;
  standard: FindingStandard;
  informational: boolean;
  sparse: boolean;
  scope: CriterionScope;
};

function scoreCategory(findings: Finding[], category: FindingCategory, pageCount: number): number {
  const items = findings.filter((f) => f.category === category);
  if (items.length === 0) return 80;

  const buckets = new Map<string, ScoreBucket>();
  for (const criterion of groupCriteria(items)) {
    const def = CRITERION_BY_KEY.get(criterion.key);
    const groupKey = def?.scoreGroup || criterion.key;
    const current = buckets.get(groupKey);
    if (current) {
      current.pass += criterion.counts.pass;
      current.warn += criterion.counts.warn;
      current.fail += criterion.counts.fail;
      continue;
    }
    buckets.set(groupKey, {
      pass: criterion.counts.pass,
      warn: criterion.counts.warn,
      fail: criterion.counts.fail,
      standard: def?.standard ?? criterion.standard,
      informational: Boolean(def?.informational),
      sparse: Boolean(def?.sparse),
      scope: def?.scope ?? 'site',
    });
  }

  let weighted = 0;
  let weightTotal = 0;
  for (const bucket of buckets.values()) {
    if (bucket.informational) continue;
    let { pass, warn, fail } = bucket;
    if (bucket.scope === 'page' && bucket.sparse && pageCount > 0) {
      const observed = pass + warn + fail;
      if (observed < pageCount) pass += pageCount - observed;
    }
    const raw = rawCriterionScore(pass, warn, fail);
    const weight = STANDARD_WEIGHT[bucket.standard] ?? 1;
    weighted += raw * weight;
    weightTotal += weight;
  }

  if (weightTotal === 0) return 80;
  return Math.round(Math.max(0, Math.min(100, weighted / weightTotal)));
}

export function aggregateScore(findings: Finding[]): { overall: number; categories: CategoryScores } {
  const pageCount = countCrawledPages(findings);
  const categories: CategoryScores = {
    crawlAccess: scoreCategory(findings, 'crawlAccess', pageCount),
    extractability: scoreCategory(findings, 'extractability', pageCount),
    negotiation: scoreCategory(findings, 'negotiation', pageCount),
    discovery: scoreCategory(findings, 'discovery', pageCount),
    citeability: scoreCategory(findings, 'citeability', pageCount),
  };
  const overall = Math.round(
    categories.crawlAccess * CATEGORY_WEIGHTS.crawlAccess +
      categories.extractability * CATEGORY_WEIGHTS.extractability +
      categories.negotiation * CATEGORY_WEIGHTS.negotiation +
      categories.discovery * CATEGORY_WEIGHTS.discovery +
      categories.citeability * CATEGORY_WEIGHTS.citeability,
  );
  return { overall, categories };
}

export function findingUrls(f: Finding & { urls?: string[] }): string[] {
  const extra = Array.isArray(f.urls) ? f.urls : [];
  return [...new Set([f.url, ...extra].filter((u): u is string => Boolean(u)))];
}

/** Group `date-${url}`-style ids so the same check is not repeated once per page. */
export function findingGroupKey(f: Finding): string {
  const urls = findingUrls(f).sort((a, b) => b.length - a.length);
  for (const url of urls) {
    if (f.id.endsWith(url)) {
      const prefix = f.id.slice(0, -url.length).replace(/-$/, '');
      if (prefix) return `${prefix}|${f.severity}|${f.title}`;
    }
  }
  return `${f.id}|${f.severity}|${f.title}`;
}

export function resolveAbsoluteUrl(url: string, base?: string | null): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).href;
  } catch {
    if (!base) return trimmed;
    try {
      return new URL(trimmed, base).href;
    } catch {
      return trimmed;
    }
  }
}

function stripUrls(text: string, urls: string[], replacement: string): string {
  const sorted = [...new Set(urls.filter(Boolean))].sort((a, b) => b.length - a.length);
  let out = text;
  for (const u of sorted) out = out.split(u).join(replacement);
  return out.replace(/\s+/g, ' ').trim();
}

function absolutizeDetailHrefs(detail: string, base?: string): string {
  if (!detail || !base) return detail;
  return detail.replace(/href=(["'])([^"']+)\1/gi, (_m, q, href) => `href=${q}${resolveAbsoluteUrl(href, base)}${q}`);
}

function summarizeGroupDetail(group: Finding[], urlList: string[]): string {
  const stripped = [
    ...new Set(group.map((g) => stripUrls(g.detail || '', urlList, 'this page')).filter(Boolean)),
  ];
  if (stripped.length === 0) {
    return urlList.length ? `Observed on ${urlList.length} page${urlList.length === 1 ? '' : 's'}.` : '';
  }
  if (stripped.length === 1 && !/this page[/\w-]/i.test(stripped[0])) {
    return urlList.length > 1 ? `${stripped[0]} (${urlList.length} pages)` : stripped[0];
  }
  return `Observed on ${urlList.length} pages. Per-page values are listed with each URL below.`;
}

export function groupPlaybook(findings: Finding[]): PlaybookItem[] {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = findingGroupKey(f);
    const list = groups.get(key);
    if (list) list.push(f);
    else groups.set(key, [f]);
  }

  const items: PlaybookItem[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    const urls = [...new Set(group.flatMap(findingUrls))];
    const count = Math.max(urls.length, group.length, 1);
    const where = urls.length === 1 ? urls[0] : urls.length > 1 ? `${urls.length} pages` : first.url || 'site origin';
    const strippedDetails = [
      ...new Set(group.map((g) => stripUrls(g.detail || '', urls, 'this page')).filter(Boolean)),
    ];
    const detail =
      strippedDetails.length === 0
        ? urls.length
          ? `Observed on ${urls.length === 1 ? urls[0] : `${urls.length} pages`}.`
          : ''
        : strippedDetails.length === 1
          ? urls.length > 1
            ? `${strippedDetails[0]} (${urls.length} pages)`
            : strippedDetails[0]
          : strippedDetails.join(' · ');
    const strippedSuggestions = [
      ...new Set(
        group.map((g) => stripUrls(g.suggestion || '', urls, urls.length > 1 ? 'these pages' : urls[0] || '')).filter(Boolean),
      ),
    ];
    items.push({
      id: findingGroupKey(first),
      category: first.category,
      title: first.title,
      detail,
      severity: first.severity,
      standard: first.standard,
      suggestion: strippedSuggestions[0] || `Fix on ${where}.`,
      url: urls[0] || first.url,
      urls,
      count,
    });
  }
  return items;
}

export function playbook(findings: Finding[]): PlaybookItem[] {
  const fails = findings.filter((f) => f.severity === 'fail');
  const warns = findings.filter((f) => f.severity === 'warn');
  return groupPlaybook([...fails, ...warns]);
}

/** Stable check id (no severity/title) so pass + warn + fail URLs share one criterion. */
const CRITERION_ALIASES: Record<string, string> = {
  'robots-missing': 'robots',
  'robots-present': 'robots',
};

const CRITERION_TITLES: Record<string, string> = Object.fromEntries(
  CRITERION_CATALOG.map((c) => [c.key, c.title]),
);

export type CriterionUrl = {
  url: string;
  detail: string;
  suggestion: string;
  pageTitle?: string;
};

export type ReportCriterion = {
  key: string;
  title: string;
  category: Finding['category'];
  standard: FindingStandard;
  counts: { pass: number; warn: number; fail: number };
  severity: FindingSeverity;
  detail: string;
  suggestion: string;
  urls: { pass: CriterionUrl[]; warn: CriterionUrl[]; fail: CriterionUrl[] };
};

export function findingCriterionKey(f: Finding): string {
  const urls = findingUrls(f).sort((a, b) => b.length - a.length);
  let key = f.id;
  for (const url of urls) {
    if (f.id.endsWith(url)) {
      const prefix = f.id.slice(0, -url.length).replace(/-$/, '');
      if (prefix) {
        key = prefix;
        break;
      }
    }
  }
  if (key === f.id && f.id.includes('|')) {
    key = f.id.split('|')[0] || f.id;
  }
  return CRITERION_ALIASES[key] || key;
}

function parseFindingsJson(raw: unknown): Finding[] {
  if (Array.isArray(raw)) return raw.filter(isFinding);
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isFinding) : [];
  } catch {
    return [];
  }
}

function isFinding(value: unknown): value is Finding {
  if (!value || typeof value !== 'object') return false;
  const f = value as Finding;
  return Boolean(f.id && f.title && f.severity && f.category);
}

const PAGE_HTML_CRITERIA = new Set(
  CRITERION_CATALOG.filter((c) => c.scope === 'page').map((c) => c.key),
);

/** Drop title/H1/etc findings that were stored against sitemaps, PDFs, and other non-HTML files. */
function isHtmlPageFindingOnNonHtmlUrl(f: Finding): boolean {
  if (!PAGE_HTML_CRITERIA.has(findingCriterionKey(f))) return false;
  const urls = findingUrls(f);
  const targets = urls.length ? urls : f.url ? [f.url] : [];
  return targets.some((url) => isGeoNonHtmlTarget(url));
}

export function collectAuditFindings(input: {
  pages?: { findings?: string | Finding[] | null }[];
  snapshotFindings?: Finding[] | null;
  playbook?: Finding[] | null;
}): Finding[] {
  const keepPageHtmlFindings = (findings: Finding[]) => findings.filter((f) => !isHtmlPageFindingOnNonHtmlUrl(f));
  /** User-configured crawl skips must not surface as crawl-access warnings. */
  const dropExclusionWarns = (findings: Finding[]) =>
    findings.filter((f) => findingCriterionKey(f) !== 'excluded');

  if (Array.isArray(input.snapshotFindings) && input.snapshotFindings.length > 0) {
    return dropExclusionWarns(keepPageHtmlFindings(input.snapshotFindings.filter(isFinding)));
  }

  const fromPages = dropExclusionWarns(
    keepPageHtmlFindings((input.pages || []).flatMap((p) => parseFindingsJson(p.findings))),
  );
  const playbookItems = dropExclusionWarns((input.playbook || []).filter(isFinding));
  if (playbookItems.length === 0) return fromPages;

  const covered = new Set<string>();
  for (const f of fromPages) {
    const key = findingCriterionKey(f);
    const urls = findingUrls(f);
    if (urls.length === 0) covered.add(`${key}\t`);
    for (const url of urls) covered.add(`${key}\t${url}`);
  }

  const extra: Finding[] = [];
  for (const item of playbookItems) {
    const key = findingCriterionKey(item);
    const urls = findingUrls(item);
    if (urls.length === 0) {
      if (!covered.has(`${key}\t`)) extra.push(item);
      continue;
    }
    const missing = urls.filter((u) => !covered.has(`${key}\t${u}`));
    if (missing.length === 0) continue;
    extra.push({
      ...item,
      url: missing[0],
      urls: missing,
    } as Finding);
  }
  return dropExclusionWarns(keepPageHtmlFindings([...fromPages, ...extra]));
}

function pageTitleFromFinding(f: Finding): string | undefined {
  if (findingCriterionKey(f) !== 'title' || !f.detail) return undefined;
  const match = f.detail.match(/<title>([\s\S]*?)<\/title>/i);
  return match?.[1]?.trim() || undefined;
}

function uniqueUrls(rows: CriterionUrl[]): CriterionUrl[] {
  const seen = new Set<string>();
  const out: CriterionUrl[] = [];
  for (const row of rows) {
    const id = row.url || row.detail;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out.sort((a, b) => a.url.localeCompare(b.url));
}

function worstSeverity(counts: ReportCriterion['counts']): FindingSeverity {
  if (counts.fail > 0) return 'fail';
  if (counts.warn > 0) return 'warn';
  return 'pass';
}

export function groupCriteria(findings: Finding[], options?: { baseUrl?: string | null }): ReportCriterion[] {
  const baseUrl = options?.baseUrl || undefined;
  const groups = new Map<string, Finding[]>();
  const pageTitles = new Map<string, string>();
  for (const f of findings) {
    const key = findingCriterionKey(f);
    const list = groups.get(key);
    if (list) list.push(f);
    else groups.set(key, [f]);
    const pageTitle = pageTitleFromFinding(f);
    if (pageTitle && f.url) pageTitles.set(resolveAbsoluteUrl(f.url, baseUrl), pageTitle);
  }

  const items: ReportCriterion[] = [];
  for (const [key, group] of groups) {
    const first = group[0];
    const buckets = { pass: [] as CriterionUrl[], warn: [] as CriterionUrl[], fail: [] as CriterionUrl[] };
    const allUrls: string[] = [];
    for (const f of group) {
      const urls = findingUrls(f);
      const targets = urls.length ? urls : [f.url || ''];
      for (const url of targets) {
        const resolved = resolveAbsoluteUrl(url || f.url || '', baseUrl);
        if (resolved) allUrls.push(resolved);
        buckets[f.severity].push({
          url: resolved,
          detail: absolutizeDetailHrefs(f.detail || '', baseUrl),
          suggestion: f.suggestion || '',
          pageTitle: resolved ? pageTitles.get(resolved) : undefined,
        });
      }
    }

    const urls = {
      pass: uniqueUrls(buckets.pass),
      warn: uniqueUrls(buckets.warn),
      fail: uniqueUrls(buckets.fail),
    };
    const counts = { pass: urls.pass.length, warn: urls.warn.length, fail: urls.fail.length };
    const uniqueTitles = [...new Set(group.map((g) => g.title).filter(Boolean))];
    const title = CRITERION_TITLES[key] || uniqueTitles[0] || key;
    const urlList = [...new Set(allUrls)];
    const strippedSuggestions = [
      ...new Set(
        group
          .filter((g) => g.severity !== 'pass')
          .map((g) => stripUrls(g.suggestion || '', urlList, urlList.length > 1 ? 'these pages' : urlList[0] || ''))
          .filter(Boolean),
      ),
    ];

    items.push({
      key,
      title,
      category: first.category,
      standard: first.standard,
      counts,
      severity: worstSeverity(counts),
      detail: summarizeGroupDetail(group, urlList),
      suggestion: strippedSuggestions[0] || '',
      urls,
    });
  }

  return items.sort((a, b) => {
    const rank = (c: ReportCriterion) => (c.counts.fail > 0 ? 0 : c.counts.warn > 0 ? 1 : 2);
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    if (b.counts.fail !== a.counts.fail) return b.counts.fail - a.counts.fail;
    if (b.counts.warn !== a.counts.warn) return b.counts.warn - a.counts.warn;
    return a.title.localeCompare(b.title);
  });
}
