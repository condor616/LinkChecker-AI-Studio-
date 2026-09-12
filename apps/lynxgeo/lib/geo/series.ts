/** Run on provision and at the start of each audit so existing GEO DBs pick up the columns. */
export const AUDIT_SERIES_ALTER_SQL = `
  ALTER TABLE "audits" ADD COLUMN IF NOT EXISTS "series_id" text;
  ALTER TABLE "audits" ADD COLUMN IF NOT EXISTS "baseline_audit_id" text;
`;

export function resolveSeriesId(audit: { id: string; seriesId?: string | null }): string {
  return audit.seriesId || audit.id;
}

export function resolveBaselineAuditId(audit: { id: string; baselineAuditId?: string | null }): string {
  return audit.baselineAuditId || audit.id;
}

/** Discovery scan — not a follow-up re-run of an earlier audit. */
export function isMainScan(audit: { id: string; baselineAuditId?: string | null }): boolean {
  return !audit.baselineAuditId || audit.baselineAuditId === audit.id;
}

/** Follow-up scan pinned to the same pages as a discovery run. */
export function isRerun(audit: { id: string; baselineAuditId?: string | null }): boolean {
  return !!audit.baselineAuditId && audit.baselineAuditId !== audit.id;
}

/** Human-readable label for a run within an ordered series (index 0 = Discovery). */
export function runLabelForIndex(
  audit: { id: string; baselineAuditId?: string | null },
  index: number,
): string {
  if (index === 0 || isMainScan(audit)) return 'Discovery';
  return `Re-run ${index}`;
}

export function countRerunsForMain(
  allAudits: Array<{ id: string; baselineAuditId?: string | null; config?: string | null; name?: string | null }>,
  mainAuditId: string,
): number {
  return allAudits.filter(
    (a) => a.baselineAuditId === mainAuditId && a.id !== mainAuditId && !isDateCheckAudit(a),
  ).length;
}

/** Date-check follow-ups must not appear as series re-runs in history. */
export function isDateCheckAudit(audit: { config?: string | null; name?: string | null }): boolean {
  if (typeof audit.name === 'string' && /\(date check\)\s*$/i.test(audit.name)) return true;
  if (!audit.config?.trim()) return false;
  try {
    const parsed = JSON.parse(audit.config) as Record<string, unknown>;
    return Boolean(parsed.dateCheckSingleArticle || parsed.dateCheckFromListing);
  } catch {
    return false;
  }
}

/** Runs that belong on a discovery's history sparkline / series chips. */
export function isHistorySeriesRun(audit: {
  id: string;
  baselineAuditId?: string | null;
  config?: string | null;
  name?: string | null;
}): boolean {
  if (isDateCheckAudit(audit)) return false;
  return isMainScan(audit) || isRerun(audit);
}

const CONFIG_COMPARE_OMIT = new Set(['isTargeted', 'targetUrls', 'name']);

/** Compare crawl settings, ignoring pinned-URL rerun fields. */
export function configsMatchForCompare(a: unknown, b: unknown): boolean {
  try {
    const left = normalizeConfigForCompare(a);
    const right = normalizeConfigForCompare(b);
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function normalizeConfigForCompare(raw: unknown): Record<string, unknown> {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed || {})) {
    if (CONFIG_COMPARE_OMIT.has(key)) continue;
    out[key] = value;
  }
  return out;
}
