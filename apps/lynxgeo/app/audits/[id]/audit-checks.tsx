'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ReportCriterion } from '@/lib/geo/score';
import {
  checkDetailHref,
  criterionMatches,
  matchingSeverities,
  severityBadge,
} from './check-detail-body';

const CHECK_PAGE_SIZE = 36;

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
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">
        <span className="font-bold text-foreground">{total.toLocaleString()}</span> checks · page{' '}
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
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
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
              aria-label={`Page ${item}`}
              title={`Page ${item}`}
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
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
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

function CheckCard({
  criterion,
  auditId,
  query,
  showSuggestion = false,
}: {
  criterion: ReportCriterion;
  auditId: string;
  query: string;
  showSuggestion?: boolean;
}) {
  const hitSevs = matchingSeverities(criterion, query);
  return (
    <Link
      href={checkDetailHref(auditId, criterion.key, query)}
      className="group flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-card transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-sm leading-tight">{criterion.title}</span>
          {criterion.counts.fail > 0 && severityBadge('fail', criterion.counts.fail)}
          {criterion.counts.warn > 0 && severityBadge('warn', criterion.counts.warn)}
          {criterion.counts.pass > 0 &&
            criterion.counts.fail === 0 &&
            criterion.counts.warn === 0 &&
            severityBadge('pass', criterion.counts.pass)}
          {criterion.standard && (
            <Badge variant="outline" className="font-normal">
              {criterion.standard}
            </Badge>
          )}
          {hitSevs.map((sev) => (
            <Badge
              key={`hit-${sev}`}
              variant={sev === 'fail' ? 'destructive' : sev === 'warn' ? 'warning' : 'success'}
              className="font-normal"
            >
              this page: {sev}
            </Badge>
          ))}
        </div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{criterion.category}</p>
        {showSuggestion && criterion.suggestion && (
          <p className="text-xs text-muted-foreground line-clamp-2">{criterion.suggestion}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}

export function AuditChecks({
  auditId,
  criteria,
  startUrl: _startUrl,
}: {
  auditId: string;
  criteria: ReportCriterion[];
  startUrl?: string | null;
}) {
  const [query, setQuery] = useState('');
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
                : `Showing ${filtered.length} check${filtered.length === 1 ? '' : 's'} for this URL. Open a check for pass / warn / fail details.`}
            </p>
          )}
        </CardContent>
      </Card>

      {suggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-1.5 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {suggestions.map((c) => (
                <CheckCard
                  key={c.key}
                  criterion={c}
                  auditId={auditId}
                  query={query}
                  showSuggestion
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Checks</CardTitle>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{criteria.length} checks</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{totals.pass} pass</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-amber-700 dark:text-amber-400 font-semibold">{totals.warn} warn</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-red-700 dark:text-red-400 font-semibold">{totals.fail} fail</span>
          </p>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground">No matching checks.</p>
          ) : (
            <>
              <div className="grid gap-1.5 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {pagedChecks.map((c) => (
                  <CheckCard key={c.key} criterion={c} auditId={auditId} query={query} />
                ))}
              </div>
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
