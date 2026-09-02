import type { Finding, PlaybookItem } from './score';
import { findingCriterionKey, findingUrls, SCORE_MODEL_VERSION, type CategoryScores } from './score';
import { geoPageUrlKey } from './origin-scope';

export type FrozenSnapshot = {
  score: number;
  scoreModelVersion: string;
  categories: CategoryScores;
  findings: Finding[];
  playbook: PlaybookItem[];
  pages: { url: string; status: string; statusCode: number | null }[];
  frozenAt: string;
};

export function freezeSnapshot(input: {
  score: number;
  categories: CategoryScores;
  findings: Finding[];
  playbook: PlaybookItem[];
  pages: FrozenSnapshot['pages'];
}): FrozenSnapshot {
  return {
    score: input.score,
    scoreModelVersion: SCORE_MODEL_VERSION,
    categories: input.categories,
    findings: input.findings,
    playbook: input.playbook,
    pages: input.pages,
    frozenAt: new Date().toISOString(),
  };
}

export type PageOverlap = {
  shared: number;
  onlyInFrom: number;
  onlyInTo: number;
};

export type CategoryDelta = {
  key: keyof CategoryScores;
  from: number;
  to: number;
  delta: number;
};

export type FindingChange = {
  from: Finding;
  to: Finding;
};

export type PageStatusChange = {
  url: string;
  fromStatus: string;
  fromStatusCode: number | null;
  toStatus: string;
  toStatusCode: number | null;
};

export type SeverityCounts = {
  fail: number;
  warn: number;
};

export type IssueSummary = {
  fromTotal: number;
  toTotal: number;
  resolved: number;
  new: number;
  changed: number;
  unchanged: number;
};

export type SnapshotDiff = {
  rubricChanged: boolean;
  configChanged: boolean;
  comparable: boolean;
  scoreDelta: number;
  pageOverlap: PageOverlap;
  categoryDeltas: CategoryDelta[];
  pageStatusChanges: PageStatusChange[];
  issueSummary: IssueSummary;
  severityFrom: SeverityCounts;
  severityTo: SeverityCounts;
  resolved: Finding[];
  newIssues: Finding[];
  changed: FindingChange[];
};

const CATEGORY_KEYS: (keyof CategoryScores)[] = [
  'crawlAccess',
  'extractability',
  'negotiation',
  'discovery',
  'citeability',
];

function snapshotPageKeys(snapshot: FrozenSnapshot): Set<string> {
  return new Set(snapshot.pages.map((page) => geoPageUrlKey(page.url)));
}

function pageOverlap(from: FrozenSnapshot, to: FrozenSnapshot): PageOverlap {
  const fromPages = snapshotPageKeys(from);
  const toPages = snapshotPageKeys(to);
  let shared = 0;
  for (const url of fromPages) {
    if (toPages.has(url)) shared += 1;
  }
  return {
    shared,
    onlyInFrom: fromPages.size - shared,
    onlyInTo: toPages.size - shared,
  };
}

function findingAlignmentKey(f: Finding): string {
  const criterion = findingCriterionKey(f);
  const urls = findingUrls(f);
  const url = urls[0] ? geoPageUrlKey(urls[0]) : '';
  return url ? `${criterion}\t${url}` : criterion;
}

function isSiteLevelFinding(f: Finding): boolean {
  return findingUrls(f).length === 0;
}

function issueAppliesToSharedPages(f: Finding, sharedPages: Set<string>): boolean {
  if (isSiteLevelFinding(f)) return true;
  return findingUrls(f).some((url) => sharedPages.has(geoPageUrlKey(url)));
}

function categoryDeltas(from: FrozenSnapshot, to: FrozenSnapshot): CategoryDelta[] {
  return CATEGORY_KEYS.map((key) => ({
    key,
    from: from.categories[key] ?? 0,
    to: to.categories[key] ?? 0,
    delta: (to.categories[key] ?? 0) - (from.categories[key] ?? 0),
  }));
}

function severityCounts(issues: Finding[]): SeverityCounts {
  let fail = 0;
  let warn = 0;
  for (const f of issues) {
    if (f.severity === 'fail') fail += 1;
    else if (f.severity === 'warn') warn += 1;
  }
  return { fail, warn };
}

function pageStatusChanges(from: FrozenSnapshot, to: FrozenSnapshot): PageStatusChange[] {
  const toByUrl = new Map(to.pages.map((page) => [geoPageUrlKey(page.url), page]));
  const changes: PageStatusChange[] = [];
  for (const fromPage of from.pages) {
    const key = geoPageUrlKey(fromPage.url);
    const toPage = toByUrl.get(key);
    if (!toPage) continue;
    if (fromPage.status !== toPage.status || fromPage.statusCode !== toPage.statusCode) {
      changes.push({
        url: fromPage.url,
        fromStatus: fromPage.status,
        fromStatusCode: fromPage.statusCode,
        toStatus: toPage.status,
        toStatusCode: toPage.statusCode,
      });
    }
  }
  return changes.sort((a, b) => a.url.localeCompare(b.url));
}

export function diffSnapshots(
  from: FrozenSnapshot,
  to: FrozenSnapshot,
  options?: { configChanged?: boolean },
): SnapshotDiff {
  const overlap = pageOverlap(from, to);
  const sharedPages = new Set<string>();
  const fromPages = snapshotPageKeys(from);
  const toPages = snapshotPageKeys(to);
  for (const url of fromPages) {
    if (toPages.has(url)) sharedPages.add(url);
  }

  const fromIssues = from.findings.filter((f) => f.severity !== 'pass' && issueAppliesToSharedPages(f, sharedPages));
  const toIssues = to.findings.filter((f) => f.severity !== 'pass' && issueAppliesToSharedPages(f, sharedPages));

  const fromByKey = new Map(fromIssues.map((f) => [findingAlignmentKey(f), f]));
  const toByKey = new Map(toIssues.map((f) => [findingAlignmentKey(f), f]));

  const resolved: Finding[] = [];
  const newIssues: Finding[] = [];
  const changed: FindingChange[] = [];

  for (const [key, finding] of fromByKey) {
    const next = toByKey.get(key);
    if (!next) {
      resolved.push(finding);
      continue;
    }
    if (next.severity !== finding.severity || next.title !== finding.title) {
      changed.push({ from: finding, to: next });
    }
  }

  for (const [key, finding] of toByKey) {
    if (!fromByKey.has(key)) newIssues.push(finding);
  }

  let unchanged = 0;
  for (const [key, finding] of fromByKey) {
    const next = toByKey.get(key);
    if (next && next.severity === finding.severity && next.title === finding.title) unchanged += 1;
  }

  const rubricChanged = from.scoreModelVersion !== to.scoreModelVersion;
  const configChanged = options?.configChanged ?? false;
  const pagesMatch = overlap.onlyInFrom === 0 && overlap.onlyInTo === 0 && overlap.shared > 0;
  const comparable = !rubricChanged && !configChanged && pagesMatch;

  return {
    rubricChanged,
    configChanged,
    comparable,
    scoreDelta: to.score - from.score,
    pageOverlap: overlap,
    categoryDeltas: categoryDeltas(from, to),
    pageStatusChanges: pageStatusChanges(from, to),
    issueSummary: {
      fromTotal: fromIssues.length,
      toTotal: toIssues.length,
      resolved: resolved.length,
      new: newIssues.length,
      changed: changed.length,
      unchanged,
    },
    severityFrom: severityCounts(fromIssues),
    severityTo: severityCounts(toIssues),
    resolved,
    newIssues,
    changed,
  };
}

export function parseSnapshotPayload(raw: string | null | undefined): FrozenSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FrozenSnapshot;
    if (!parsed.scoreModelVersion) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function pinnedTargetUrls(snapshot: FrozenSnapshot): string[] {
  return snapshot.pages.map((page) => geoPageUrlKey(page.url));
}
