import type { Finding } from './score';

/** Run on provision and at the start of each audit so existing GEO DBs pick up the column. */
export const AUDIT_FRONTIER_ALTER_SQL = `ALTER TABLE "audits" ADD COLUMN IF NOT EXISTS "frontier" text`;

export type FrontierItem = {
  url: string;
  depth: number;
  parentUrl: string | null;
};

export type AuditFrontier = {
  probesDone: boolean;
  queue: FrontierItem[];
  seen: string[];
  pagesFetched: number;
  phase: 'probes' | 'crawl';
  probeFindings: Finding[];
};

export const AUDIT_CONTROL_STATUSES = ['PAUSED', 'RUNNING', 'CANCELLED'] as const;
export type AuditControlStatus = (typeof AUDIT_CONTROL_STATUSES)[number];

export class AuditControlSignal extends Error {
  readonly control: 'PAUSED' | 'CANCELLED';

  constructor(control: 'PAUSED' | 'CANCELLED') {
    super(control);
    this.name = 'AuditControlSignal';
    this.control = control;
  }
}

export function emptyFrontier(startUrl: string): AuditFrontier {
  return {
    probesDone: false,
    queue: [{ url: startUrl, depth: 0, parentUrl: null }],
    seen: [],
    pagesFetched: 0,
    phase: 'probes',
    probeFindings: [],
  };
}

export function buildFrontier(input: {
  probesDone: boolean;
  queue: FrontierItem[];
  seen: Iterable<string>;
  pagesFetched: number;
  phase?: 'probes' | 'crawl';
  probeFindings?: Finding[];
}): AuditFrontier {
  return {
    probesDone: input.probesDone,
    queue: input.queue.map((item) => ({
      url: item.url,
      depth: item.depth,
      parentUrl: item.parentUrl ?? null,
    })),
    seen: [...input.seen],
    pagesFetched: Math.max(0, input.pagesFetched),
    phase: input.phase ?? (input.probesDone ? 'crawl' : 'probes'),
    probeFindings: input.probeFindings ? [...input.probeFindings] : [],
  };
}

export function parseFrontier(raw: unknown): AuditFrontier | null {
  if (raw == null || raw === '') return null;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== 'object') return null;
    const queueRaw = (obj as { queue?: unknown }).queue;
    if (!Array.isArray(queueRaw)) return null;
    const queue: FrontierItem[] = [];
    for (const item of queueRaw) {
      if (!item || typeof item !== 'object') continue;
      const url = (item as { url?: unknown }).url;
      if (typeof url !== 'string' || !url) continue;
      const depth = Number((item as { depth?: unknown }).depth);
      const parent = (item as { parentUrl?: unknown }).parentUrl;
      queue.push({
        url,
        depth: Number.isFinite(depth) ? depth : 0,
        parentUrl: typeof parent === 'string' ? parent : null,
      });
    }
    const seenRaw = (obj as { seen?: unknown }).seen;
    const seen = Array.isArray(seenRaw) ? seenRaw.filter((u): u is string => typeof u === 'string' && !!u) : [];
    const findingsRaw = (obj as { probeFindings?: unknown }).probeFindings;
    const probeFindings = Array.isArray(findingsRaw) ? (findingsRaw as Finding[]) : [];
    const pagesFetched = Number((obj as { pagesFetched?: unknown }).pagesFetched);
    return buildFrontier({
      probesDone: Boolean((obj as { probesDone?: unknown }).probesDone),
      queue,
      seen,
      pagesFetched: Number.isFinite(pagesFetched) ? pagesFetched : seen.length,
      phase: (obj as { phase?: unknown }).phase === 'crawl' ? 'crawl' : 'probes',
      probeFindings,
    });
  } catch {
    return null;
  }
}

export function serializeFrontier(frontier: AuditFrontier): string {
  return JSON.stringify(frontier);
}

/** Client PATCH targets. Resume is RUNNING only from PAUSED. */
export function canTransitionAuditStatus(from: string, to: string): boolean {
  if (to === 'PAUSED') return from === 'RUNNING';
  if (to === 'CANCELLED') return from === 'RUNNING' || from === 'PAUSED';
  if (to === 'RUNNING') return from === 'PAUSED';
  return false;
}

export function isStopStatus(status: string | null | undefined): status is 'PAUSED' | 'CANCELLED' {
  return status === 'PAUSED' || status === 'CANCELLED';
}

/** Unique per enqueue so pause/resume can add a second Bull job for the same audit. */
export function nextGeoAuditJobId(auditId: string): string {
  return `geo-audit-${auditId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
