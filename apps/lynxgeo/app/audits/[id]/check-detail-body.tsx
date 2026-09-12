'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { checkRefForKey, type CheckRef } from '@/lib/geo/check-refs';
import { resolveAbsoluteUrl, type CriterionUrl, type FindingSeverity, type ReportCriterion } from '@/lib/geo/score';

export const SEVERITY_ORDER: FindingSeverity[] = ['fail', 'warn', 'pass'];
const URL_PAGE_SIZE = 20;

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  fail: 'Failing URLs',
  warn: 'Warnings',
  pass: 'Passing URLs',
};

export function severityBadge(severity: FindingSeverity, count?: number) {
  const label = count == null ? severity : `${count} ${severity}`;
  if (severity === 'fail') return <Badge variant="destructive">{label}</Badge>;
  if (severity === 'warn') return <Badge variant="warning">{label}</Badge>;
  return <Badge variant="success">{label}</Badge>;
}

export function severityRowClass(severity: FindingSeverity) {
  if (severity === 'fail') return 'border-l-red-500 bg-red-50/90 dark:bg-red-950/40';
  if (severity === 'warn') return 'border-l-amber-400 bg-amber-50/90 dark:bg-amber-950/35';
  return 'border-l-emerald-500 bg-emerald-50/90 dark:bg-emerald-950/35';
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q || !text) return <>{text}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={`${part}-${i}`} className="rounded-sm bg-amber-200 px-0.5 text-amber-950 dark:bg-amber-400/40 dark:text-foreground">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${i}`}>{part}</span>
        ),
      )}
    </>
  );
}

function OfficialRequirement({ docRef }: { docRef?: CheckRef }) {
  if (!docRef) return null;
  return (
    <a
      href={docRef.href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm text-primary hover:underline underline-offset-2"
      title={`${docRef.title} — ${docRef.publisher}`}
    >
      <span>
        Official requirement: {docRef.title} ({docRef.publisher})
      </span>
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
    </a>
  );
}

export function urlMatches(row: CriterionUrl, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return row.url.toLowerCase().includes(q) || Boolean(row.pageTitle && row.pageTitle.toLowerCase().includes(q));
}

export function criterionMatches(c: ReportCriterion, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (c.title.toLowerCase().includes(q) || c.key.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) {
    return true;
  }
  return SEVERITY_ORDER.some((sev) => c.urls[sev].some((row) => urlMatches(row, query)));
}

function rowsForQuery(rows: CriterionUrl[], query: string): CriterionUrl[] {
  const q = query.trim();
  if (!q) return rows;
  const matched = rows.filter((row) => urlMatches(row, query));
  return matched.length > 0 ? matched : rows;
}

export function matchingSeverities(c: ReportCriterion, query: string): FindingSeverity[] {
  if (!query.trim()) return [];
  return SEVERITY_ORDER.filter((sev) => c.urls[sev].some((row) => urlMatches(row, query)));
}

function PaginationBar({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (next: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
      <p className="text-[10px] font-medium text-muted-foreground">
        <span className="font-bold text-foreground">{total.toLocaleString()}</span> results · page{' '}
        <span className="font-bold text-foreground">{page}</span> of{' '}
        <span className="font-bold text-foreground">{totalPages}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        {pages.map((item, i) =>
          item === '...' ? (
            <span key={`ellipsis-${i}`} className="h-8 w-8 text-center text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === page ? 'default' : 'outline'}
              size="icon"
              className="h-8 w-8 text-xs"
              onClick={() => onPageChange(item)}
              aria-current={item === page ? 'page' : undefined}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function UrlList({
  rows,
  query,
  severity,
  baseUrl,
}: {
  rows: CriterionUrl[];
  query: string;
  severity: FindingSeverity;
  baseUrl?: string | null;
}) {
  const [page, setPage] = useState(1);
  const paginationAnchorRef = useRef<HTMLDivElement>(null);
  const paginationTopBeforeChangeRef = useRef<number | null>(null);
  const filtered = useMemo(() => rowsForQuery(rows, query), [rows, query]);

  useEffect(() => {
    setPage(1);
  }, [query, rows]);

  useLayoutEffect(() => {
    const beforeTop = paginationTopBeforeChangeRef.current;
    if (beforeTop == null) return;
    paginationTopBeforeChangeRef.current = null;
    const anchor = paginationAnchorRef.current;
    if (!anchor) return;
    const delta = anchor.getBoundingClientRect().top - beforeTop;
    if (delta !== 0) window.scrollBy(0, delta);
  }, [page]);

  const handlePageChange = (next: number) => {
    const anchor = paginationAnchorRef.current;
    if (anchor) paginationTopBeforeChangeRef.current = anchor.getBoundingClientRect().top;
    setPage(next);
  };

  if (filtered.length === 0) return null;

  const totalPages = Math.max(1, Math.ceil(filtered.length / URL_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = filtered.slice((safePage - 1) * URL_PAGE_SIZE, safePage * URL_PAGE_SIZE);

  return (
    <div className="mt-2">
      <ul className="space-y-1.5 text-xs">
        {slice.map((row) => {
          const href = resolveAbsoluteUrl(row.url, baseUrl) || row.url;
          const label = href || 'site origin';
          const extra = row.detail && !/this page[/\w-]/i.test(row.detail) ? row.detail : '';
          const inner = (
            <span className="font-mono break-all">
              <Highlight text={label} query={query} />
            </span>
          );
          return (
            <li
              key={`${href}-${row.detail.slice(0, 40)}`}
              className={cn('rounded-md border-l-4 px-2 py-1.5', severityRowClass(severity))}
            >
              <div className="flex flex-wrap items-center gap-2">
                {severityBadge(severity)}
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer" className="hover:underline underline-offset-2">
                    {inner}
                  </a>
                ) : (
                  inner
                )}
              </div>
              {row.pageTitle && (
                <p className="text-muted-foreground mt-0.5">
                  <Highlight text={row.pageTitle} query={query} />
                </p>
              )}
              {extra && <p className="text-muted-foreground mt-0.5 break-words">{extra}</p>}
            </li>
          );
        })}
      </ul>
      <div ref={paginationAnchorRef}>
        <PaginationBar page={safePage} total={filtered.length} pageSize={URL_PAGE_SIZE} onPageChange={handlePageChange} />
      </div>
    </div>
  );
}

export function CheckDetailBody({
  criterion,
  startUrl,
  query = '',
}: {
  criterion: ReportCriterion;
  startUrl?: string | null;
  query?: string;
}) {
  const searching = query.trim().length > 0;
  const docRef = checkRefForKey(criterion.key);

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{criterion.category}</p>
      {criterion.detail && !criterion.detail.includes(' · ') && !/this page[/\w-]/i.test(criterion.detail) && (
        <div>
          <p className="font-medium">Observed</p>
          <p className="text-muted-foreground mt-0.5">{criterion.detail}</p>
        </div>
      )}
      {criterion.suggestion && (
        <div>
          <p className="font-medium">How to fix</p>
          <p className="mt-0.5">{criterion.suggestion}</p>
        </div>
      )}
      {criterion.agentPrompt && criterion.severity !== 'pass' && (
        <div>
          <p className="font-medium">Agent prompt</p>
          <pre className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs">
            {criterion.agentPrompt}
          </pre>
        </div>
      )}
      {docRef && (
        <div>
          <p className="font-medium">Standard</p>
          <OfficialRequirement docRef={docRef} />
        </div>
      )}
      {SEVERITY_ORDER.map((sev) => {
        if (criterion.urls[sev].length === 0) return null;
        const anyUrlHit = SEVERITY_ORDER.some((s) => criterion.urls[s].some((row) => urlMatches(row, query)));
        const bucketHits = criterion.urls[sev].some((row) => urlMatches(row, query));
        if (searching && anyUrlHit && !bucketHits) return null;
        const shown = rowsForQuery(criterion.urls[sev], query);
        return (
          <div key={sev}>
            <div className="flex items-center gap-2">
              {severityBadge(sev, shown.length)}
              <span className="text-muted-foreground text-xs">{SEVERITY_LABEL[sev]}</span>
            </div>
            <UrlList rows={criterion.urls[sev]} query={query} severity={sev} baseUrl={startUrl} />
          </div>
        );
      })}
    </div>
  );
}

export function checkDetailHref(auditId: string, key: string, query?: string): string {
  const base = `/audits/${auditId}/checks/${encodeURIComponent(key)}`;
  const q = query?.trim();
  return q ? `${base}?q=${encodeURIComponent(q)}` : base;
}
