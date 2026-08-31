'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Search } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { checkRefForKey, type CheckRef } from '@/lib/geo/check-refs';
import { resolveAbsoluteUrl, type CriterionUrl, type FindingSeverity, type ReportCriterion } from '@/lib/geo/score';

const SEVERITY_ORDER: FindingSeverity[] = ['fail', 'warn', 'pass'];
const URL_PAGE_SIZE = 20;
const CHECK_PAGE_SIZE = 12;

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  fail: 'Failing URLs',
  warn: 'Warnings',
  pass: 'Passing URLs',
};

function severityBadge(severity: FindingSeverity, count?: number) {
  const label = count == null ? severity : `${count} ${severity}`;
  if (severity === 'fail') return <Badge variant="destructive">{label}</Badge>;
  if (severity === 'warn') return <Badge variant="warning">{label}</Badge>;
  return <Badge variant="success">{label}</Badge>;
}

function severityRowClass(severity: FindingSeverity) {
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

function OfficialRequirement({ docRef, compact }: { docRef?: CheckRef; compact?: boolean }) {
  if (!docRef) return null;
  return (
    <a
      href={docRef.href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1 text-primary hover:underline underline-offset-2',
        compact ? 'text-[11px]' : 'text-sm',
      )}
      title={`${docRef.title} — ${docRef.publisher}`}
    >
      <span>Official requirement{compact ? '' : `: ${docRef.title} (${docRef.publisher})`}</span>
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
    </a>
  );
}

function urlMatches(row: CriterionUrl, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return row.url.toLowerCase().includes(q) || Boolean(row.pageTitle && row.pageTitle.toLowerCase().includes(q));
}

function criterionMatches(c: ReportCriterion, query: string): boolean {
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

function matchingSeverities(c: ReportCriterion, query: string): FindingSeverity[] {
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
  docRef,
}: {
  rows: CriterionUrl[];
  query: string;
  severity: FindingSeverity;
  baseUrl?: string | null;
  docRef?: CheckRef;
}) {
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => rowsForQuery(rows, query), [rows, query]);

  useEffect(() => {
    setPage(1);
  }, [query, rows]);

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
              {severity !== 'pass' && docRef && (
                <p className="mt-1">
                  <OfficialRequirement docRef={docRef} compact />
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <PaginationBar page={safePage} total={filtered.length} pageSize={URL_PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by page URL…"
        aria-label="Search by page URL"
        className="pl-10"
      />
    </div>
  );
}

export function AuditChecks({ criteria, startUrl }: { criteria: ReportCriterion[]; startUrl?: string | null }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string[]>([]);
  const [checkPage, setCheckPage] = useState(1);

  const filtered = useMemo(() => criteria.filter((c) => criterionMatches(c, query)), [criteria, query]);
  const searching = query.trim().length > 0;

  useEffect(() => {
    setCheckPage(1);
  }, [query]);

  const totals = useMemo(() => {
    return criteria.reduce(
      (acc, c) => {
        acc.pass += c.counts.pass;
        acc.warn += c.counts.warn;
        acc.fail += c.counts.fail;
        return acc;
      },
      { pass: 0, warn: 0, fail: 0 },
    );
  }, [criteria]);

  const suggestions = useMemo(() => {
    const actionable = criteria.filter((c) => c.counts.fail > 0 || c.counts.warn > 0);
    return searching ? actionable.filter((c) => criterionMatches(c, query)) : actionable;
  }, [criteria, query, searching]);

  const checkPages = Math.max(1, Math.ceil(filtered.length / CHECK_PAGE_SIZE));
  const safeCheckPage = Math.min(checkPage, checkPages);
  const pagedChecks = filtered.slice((safeCheckPage - 1) * CHECK_PAGE_SIZE, safeCheckPage * CHECK_PAGE_SIZE);
  const accordionValue = searching ? pagedChecks.map((c) => c.key) : open;

  const jumpTo = (key: string) => {
    setQuery('');
    const index = criteria.findIndex((c) => c.key === key);
    setCheckPage(index >= 0 ? Math.floor(index / CHECK_PAGE_SIZE) + 1 : 1);
    setOpen([key]);
    requestAnimationFrame(() => {
      document.getElementById(`check-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  if (criteria.length === 0) {
    return (
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Checks</CardTitle>
          <SearchField value={query} onChange={setQuery} />
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No checks yet (audit may still be running).</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-2">
          <SearchField value={query} onChange={setQuery} />
          {searching && (
            <p className="text-xs text-muted-foreground">
              {filtered.length === 0
                ? 'No checks mention that URL or title.'
                : `Showing ${filtered.length} check${filtered.length === 1 ? '' : 's'} for this URL. Matching lists show whether the page passed, warned, or failed.`}
            </p>
          )}
        </CardContent>
      </Card>

      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Suggestions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suggestions.map((c) => {
              const worst: FindingSeverity = c.counts.fail > 0 ? 'fail' : 'warn';
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => jumpTo(c.key)}
                  className={cn(
                    'flex w-full flex-wrap items-center gap-2 rounded-md border border-transparent border-l-4 px-2 py-1.5 text-left hover:border-primary/30',
                    severityRowClass(worst),
                  )}
                >
                  {c.counts.fail > 0 && severityBadge('fail', c.counts.fail)}
                  {c.counts.warn > 0 && severityBadge('warn', c.counts.warn)}
                  <span className="font-semibold">{c.title}</span>
                  {c.suggestion && (
                    <span className="w-full text-sm text-muted-foreground line-clamp-1 sm:ml-auto sm:max-w-md">
                      {c.suggestion}
                    </span>
                  )}
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>Checks</CardTitle>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{criteria.length} checks</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{totals.pass} pass</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-amber-700 dark:text-amber-400 font-semibold">{totals.warn} warn</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-red-700 dark:text-red-400 font-semibold">{totals.fail} fail</span>
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground">No matching checks.</p>
          ) : (
            <>
              <Accordion
                type="multiple"
                value={accordionValue}
                onValueChange={(next) => {
                  if (!searching) setOpen(next);
                }}
                className="w-full"
              >
                {pagedChecks.map((c) => {
                  const hitSevs = matchingSeverities(c, query);
                  const docRef = checkRefForKey(c.key);
                  return (
                    <AccordionItem key={c.key} value={c.key} id={`check-${c.key}`}>
                      <AccordionTrigger className="hover:no-underline text-left">
                        <span className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
                          <span className="font-semibold">{c.title}</span>
                          <span className="flex flex-wrap gap-1.5">
                            {c.counts.pass > 0 && severityBadge('pass', c.counts.pass)}
                            {c.counts.warn > 0 && severityBadge('warn', c.counts.warn)}
                            {c.counts.fail > 0 && severityBadge('fail', c.counts.fail)}
                            {c.standard && (
                              <Badge variant="outline" className="font-normal">
                                {c.standard}
                              </Badge>
                            )}
                            {hitSevs.length > 0 &&
                              hitSevs.map((sev) => (
                                <Badge
                                  key={`hit-${sev}`}
                                  variant={sev === 'fail' ? 'destructive' : sev === 'warn' ? 'warning' : 'success'}
                                  className="font-normal"
                                >
                                  this page: {sev}
                                </Badge>
                              ))}
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 text-sm">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.category}</p>
                          {c.detail && !c.detail.includes(' · ') && !/this page[/\w-]/i.test(c.detail) && (
                            <div>
                              <p className="font-medium">Observed</p>
                              <p className="text-muted-foreground mt-0.5">{c.detail}</p>
                            </div>
                          )}
                          {c.suggestion && (
                            <div>
                              <p className="font-medium">How to fix</p>
                              <p className="mt-0.5">{c.suggestion}</p>
                            </div>
                          )}
                          {docRef && (
                            <div>
                              <p className="font-medium">Standard</p>
                              <OfficialRequirement docRef={docRef} />
                            </div>
                          )}
                          {SEVERITY_ORDER.map((sev) => {
                            if (c.urls[sev].length === 0) return null;
                            const anyUrlHit = SEVERITY_ORDER.some((s) => c.urls[s].some((row) => urlMatches(row, query)));
                            const bucketHits = c.urls[sev].some((row) => urlMatches(row, query));
                            if (searching && anyUrlHit && !bucketHits) return null;
                            const shown = rowsForQuery(c.urls[sev], query);
                            return (
                              <div key={sev}>
                                <div className="flex items-center gap-2">
                                  {severityBadge(sev, shown.length)}
                                  <span className="text-muted-foreground text-xs">{SEVERITY_LABEL[sev]}</span>
                                </div>
                                <UrlList
                                  rows={c.urls[sev]}
                                  query={query}
                                  severity={sev}
                                  baseUrl={startUrl}
                                  docRef={docRef}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
              <PaginationBar
                page={safeCheckPage}
                total={filtered.length}
                pageSize={CHECK_PAGE_SIZE}
                onPageChange={setCheckPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
