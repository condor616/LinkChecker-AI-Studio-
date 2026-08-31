/** Run on provision and at the start of each audit so existing GEO DBs pick up the column. */
export const AUDIT_PROGRESS_ALTER_SQL = `ALTER TABLE "audits" ADD COLUMN IF NOT EXISTS "progress" text`;

export const AUDIT_PHASES = ['robots.txt', 'sitemap', 'crawl', 'scoring', 'snapshot', 'done'] as const;
export type AuditPhase = (typeof AUDIT_PHASES)[number];

/** 0 / omitted = no page cap. */
export function resolveAuditMaxPages(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1_000_000, Math.floor(n));
}

export function isUnlimitedPages(maxPages: number | null | undefined): boolean {
  return resolveAuditMaxPages(maxPages) <= 0;
}

export type AuditProgress = {
  phase: AuditPhase;
  pagesFetched: number;
  maxPages: number;
  currentUrl: string | null;
  message: string;
  queuedRemaining?: number;
};

export function formatAuditProgressMessage(input: {
  phase: AuditPhase;
  pagesFetched: number;
  maxPages: number;
  currentUrl?: string | null;
}): string {
  const url = input.currentUrl?.trim();
  const withUrl = url ? ` · ${url}` : '';
  const unlimited = isUnlimitedPages(input.maxPages);
  switch (input.phase) {
    case 'robots.txt':
      return `Checking robots.txt${withUrl}`;
    case 'sitemap':
      return `Checking sitemap${withUrl}`;
    case 'crawl':
      return unlimited
        ? `Crawling ${input.pagesFetched} pages${withUrl}`
        : `Crawling ${input.pagesFetched} / ${input.maxPages}${withUrl}`;
    case 'scoring':
      return `Scoring ${input.pagesFetched} pages`;
    case 'snapshot':
      return `Saving snapshot · ${input.pagesFetched} pages`;
    case 'done':
      return unlimited ? `Crawled ${input.pagesFetched} pages` : `Crawled ${input.pagesFetched} / ${input.maxPages}`;
  }
}

export function buildAuditProgress(input: {
  phase: AuditPhase;
  pagesFetched: number;
  maxPages?: number;
  currentUrl?: string | null;
  queuedRemaining?: number;
}): AuditProgress {
  const maxPages = resolveAuditMaxPages(input.maxPages);
  const pagesFetched = Math.max(0, input.pagesFetched);
  const currentUrl = input.currentUrl ?? null;
  const queuedRemaining =
    typeof input.queuedRemaining === 'number' && Number.isFinite(input.queuedRemaining)
      ? Math.max(0, Math.floor(input.queuedRemaining))
      : undefined;
  const draft: AuditProgress = {
    phase: input.phase,
    pagesFetched,
    maxPages,
    currentUrl,
    message: '',
    ...(queuedRemaining != null ? { queuedRemaining } : {}),
  };
  draft.message = formatAuditProgressMessage(draft);
  return draft;
}

export function parseAuditProgress(raw: unknown): AuditProgress | null {
  if (raw == null || raw === '') return null;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== 'object') return null;
    const phase = (obj as { phase?: unknown }).phase;
    if (typeof phase !== 'string' || !(AUDIT_PHASES as readonly string[]).includes(phase)) return null;
    const pagesFetched = Number((obj as { pagesFetched?: unknown }).pagesFetched);
    const queuedRaw = (obj as { queuedRemaining?: unknown }).queuedRemaining;
    const currentRaw = (obj as { currentUrl?: unknown }).currentUrl;
    const currentUrl = typeof currentRaw === 'string' && currentRaw ? currentRaw : null;
    return buildAuditProgress({
      phase: phase as AuditPhase,
      pagesFetched: Number.isFinite(pagesFetched) ? pagesFetched : 0,
      maxPages: resolveAuditMaxPages((obj as { maxPages?: unknown }).maxPages),
      currentUrl,
      queuedRemaining: typeof queuedRaw === 'number' ? queuedRaw : undefined,
    });
  } catch {
    return null;
  }
}

/**
 * Determinate 0–100 when a cap or known remaining queue exists.
 * Unlimited with no queue length returns null (indeterminate bar).
 * Running audits with a known total cap at 99% until phase `done`.
 */
export function auditProgressPercent(progress: AuditProgress | null, status?: string): number | null {
  if (status === 'COMPLETED' || progress?.phase === 'done') return 100;
  if (!progress) return status === 'CANCELLED' ? 0 : null;
  if (!isUnlimitedPages(progress.maxPages)) {
    const crawlPct = Math.round((progress.pagesFetched / progress.maxPages) * 100);
    return Math.min(99, Math.max(0, crawlPct));
  }
  const queued = progress.queuedRemaining;
  if (queued != null && progress.pagesFetched + queued > 0) {
    const known = progress.pagesFetched + queued;
    return Math.min(99, Math.max(0, Math.round((progress.pagesFetched / known) * 100)));
  }
  return status === 'CANCELLED' && progress.pagesFetched === 0 ? 0 : null;
}
