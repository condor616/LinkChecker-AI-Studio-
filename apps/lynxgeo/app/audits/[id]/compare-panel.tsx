'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CATEGORY_META, type Finding, type FindingCategory, type FindingSeverity } from '@/lib/geo/score';

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function deltaClass(delta: number): string {
  if (delta > 0) return 'text-emerald-700 dark:text-emerald-400';
  if (delta < 0) return 'text-red-700 dark:text-red-400';
  return 'text-muted-foreground';
}

function scoreClass(score: number): string {
  if (score >= 80) return 'text-emerald-700 dark:text-emerald-400';
  if (score >= 60) return 'text-amber-700 dark:text-amber-400';
  return 'text-red-700 dark:text-red-400';
}

function severityBadge(severity: FindingSeverity) {
  if (severity === 'fail') return <Badge variant="destructive">{severity}</Badge>;
  if (severity === 'warn') return <Badge variant="warning">{severity}</Badge>;
  return <Badge variant="success">{severity}</Badge>;
}

function severityRowClass(severity: FindingSeverity) {
  if (severity === 'fail') return 'border-l-red-500 bg-red-50/90 dark:bg-red-950/40';
  if (severity === 'warn') return 'border-l-amber-400 bg-amber-50/90 dark:bg-amber-950/35';
  return 'border-l-emerald-500 bg-emerald-50/90 dark:bg-emerald-950/35';
}

function FindingUrl({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline text-xs break-all"
    >
      {url}
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
    </a>
  );
}

function IssueDetail({ finding }: { finding: Finding }) {
  return (
    <div className={cn('rounded-md border border-border border-l-4 p-3 space-y-2', severityRowClass(finding.severity))}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{finding.title}</span>
        {severityBadge(finding.severity)}
        <Badge variant="outline">{CATEGORY_META[finding.category]?.label ?? finding.category}</Badge>
      </div>
      {finding.detail && <p className="text-sm text-muted-foreground">{finding.detail}</p>}
      {finding.suggestion && (
        <p className="text-sm">
          <span className="font-medium">Suggestion: </span>
          {finding.suggestion}
        </p>
      )}
      <FindingUrl url={finding.url} />
    </div>
  );
}

function ChangedIssueDetail({ from, to }: { from: Finding; to: Finding }) {
  return (
    <div className="rounded-md border border-border p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{from.title}</span>
        {severityBadge(from.severity)}
        <span className="text-muted-foreground">→</span>
        {severityBadge(to.severity)}
        <Badge variant="outline">{CATEGORY_META[from.category]?.label ?? from.category}</Badge>
      </div>
      {(from.detail || to.detail) && (
        <div className="text-sm space-y-1">
          {from.detail && (
            <p>
              <span className="text-muted-foreground">Before: </span>
              {from.detail}
            </p>
          )}
          {to.detail && to.detail !== from.detail && (
            <p>
              <span className="text-muted-foreground">After: </span>
              {to.detail}
            </p>
          )}
        </div>
      )}
      {(from.suggestion || to.suggestion) && (
        <p className="text-sm">
          <span className="font-medium">Suggestion: </span>
          {to.suggestion || from.suggestion}
        </p>
      )}
      <FindingUrl url={from.url || to.url} />
    </div>
  );
}

function groupByCategory<T extends { category: FindingCategory }>(items: T[]): Map<FindingCategory, T[]> {
  const map = new Map<FindingCategory, T[]>();
  for (const item of items) {
    const list = map.get(item.category) || [];
    list.push(item);
    map.set(item.category, list);
  }
  return map;
}

function IssueGroupList({
  title,
  items,
}: {
  title: string;
  items: Finding[];
}) {
  const grouped = useMemo(() => groupByCategory(items), [items]);
  const categories = [...grouped.keys()].sort(
    (a, b) => (CATEGORY_META[a]?.label ?? a).localeCompare(CATEGORY_META[b]?.label ?? b),
  );

  if (items.length === 0) {
    return (
      <div>
        <p className="font-medium mb-2">{title} (0)</p>
        <p className="text-sm text-muted-foreground">None</p>
      </div>
    );
  }

  const useAccordion = items.length > 5;

  if (!useAccordion) {
    return (
      <div>
        <p className="font-medium mb-2">{title} ({items.length})</p>
        <div className="space-y-2">
          {items.map((f) => (
            <IssueDetail key={f.id} finding={f} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="font-medium mb-2">{title} ({items.length})</p>
      <Accordion type="multiple" className="w-full">
        {categories.map((cat) => {
          const catItems = grouped.get(cat) || [];
          return (
            <AccordionItem key={cat} value={cat}>
              <AccordionTrigger className="py-2 text-sm">
                <span>
                  {CATEGORY_META[cat]?.label ?? cat}{' '}
                  <span className="text-muted-foreground font-normal">({catItems.length})</span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {catItems.map((f) => (
                    <IssueDetail key={f.id} finding={f} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

function ChangedGroupList({ items }: { items: Array<{ from: Finding; to: Finding }> }) {
  const grouped = useMemo(() => {
    const map = new Map<FindingCategory, Array<{ from: Finding; to: Finding }>>();
    for (const item of items) {
      const list = map.get(item.from.category) || [];
      list.push(item);
      map.set(item.from.category, list);
    }
    return map;
  }, [items]);

  if (items.length === 0) {
    return (
      <div>
        <p className="font-medium mb-2">Changed (0)</p>
        <p className="text-sm text-muted-foreground">None</p>
      </div>
    );
  }

  const categories = [...grouped.keys()].sort(
    (a, b) => (CATEGORY_META[a]?.label ?? a).localeCompare(CATEGORY_META[b]?.label ?? b),
  );
  const useAccordion = items.length > 5;

  if (!useAccordion) {
    return (
      <div>
        <p className="font-medium mb-2">Changed ({items.length})</p>
        <div className="space-y-2">
          {items.map((row) => (
            <ChangedIssueDetail key={`${row.from.id}-${row.to.id}`} from={row.from} to={row.to} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="font-medium mb-2">Changed ({items.length})</p>
      <Accordion type="multiple" className="w-full">
        {categories.map((cat) => {
          const catItems = grouped.get(cat) || [];
          return (
            <AccordionItem key={cat} value={cat}>
              <AccordionTrigger className="py-2 text-sm">
                <span>
                  {CATEGORY_META[cat]?.label ?? cat}{' '}
                  <span className="text-muted-foreground font-normal">({catItems.length})</span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {catItems.map((row) => (
                    <ChangedIssueDetail key={`${row.from.id}-${row.to.id}`} from={row.from} to={row.to} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

function ComparabilityBanner({ diff }: { diff: any }) {
  const { comparable, rubricChanged, configChanged, pageOverlap } = diff;
  const pageMismatch =
    pageOverlap && (pageOverlap.onlyInFrom > 0 || pageOverlap.onlyInTo > 0);

  if (comparable) {
    return (
      <div className="rounded-lg border border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm">
        <strong className="text-emerald-800 dark:text-emerald-300">Valid comparison</strong>
        <span className="text-emerald-700 dark:text-emerald-400">
          {' '}
          — same pages, crawl config, and scoring rubric. Score and issue deltas are apples-to-apples.
        </span>
      </div>
    );
  }

  const reasons: string[] = [];
  if (rubricChanged) reasons.push('scoring rubric changed');
  if (configChanged) reasons.push('crawl configuration changed');
  if (pageMismatch) {
    reasons.push(
      `page sets differ (${pageOverlap.shared} shared, ${pageOverlap.onlyInFrom} only in baseline, ${pageOverlap.onlyInTo} only in current)`,
    );
  }

  const isWarning = !rubricChanged && !configChanged && pageMismatch;

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3 text-sm',
        isWarning
          ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200'
          : 'border-red-400 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200',
      )}
    >
      <strong>{isWarning ? 'Partial comparison' : 'Not comparable'}</strong>
      <span> — {reasons.join('; ')}. Issue diff is limited to shared pages; headline score delta is for reference only.</span>
    </div>
  );
}

export function ComparePanel({ diff }: { diff: any }) {
  const [showPageChanges, setShowPageChanges] = useState(true);

  if (!diff || diff.error) return null;

  const summary = diff.issueSummary || {};
  const severityFrom = diff.severityFrom || { fail: 0, warn: 0 };
  const severityTo = diff.severityTo || { fail: 0, warn: 0 };
  const pageChanges = diff.pageStatusChanges || [];

  return (
    <div className="space-y-6">
      {/* Comparison header */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground mb-3">
          Comparing <strong className="text-foreground">{diff.from?.runLabel}</strong>
          {' → '}
          <strong className="text-foreground">{diff.to?.runLabel}</strong>
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{diff.from?.runLabel}</p>
            <p className="text-sm font-medium truncate">{diff.from?.name}</p>
            <p className="text-xs text-muted-foreground">
              {diff.from?.createdAt ? new Date(diff.from.createdAt).toLocaleString() : '—'}
              {' · '}
              {diff.from?.pageCount ?? 0} pages
            </p>
            <div className={cn('text-4xl font-black mt-2', scoreClass(diff.from?.score ?? 0))}>
              {diff.from?.score ?? '—'}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{diff.to?.runLabel}</p>
            <p className="text-sm font-medium truncate">{diff.to?.name}</p>
            <p className="text-xs text-muted-foreground">
              {diff.to?.createdAt ? new Date(diff.to.createdAt).toLocaleString() : '—'}
              {' · '}
              {diff.to?.pageCount ?? 0} pages
            </p>
            <div className="flex items-baseline gap-3 mt-2">
              <div className={cn('text-4xl font-black', scoreClass(diff.to?.score ?? 0))}>
                {diff.to?.score ?? '—'}
              </div>
              <span className={cn('text-lg font-bold', deltaClass(diff.scoreDelta ?? 0))}>
                {formatDelta(diff.scoreDelta ?? 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <ComparabilityBanner diff={diff} />

      {/* Summary stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-muted-foreground">Shared pages</CardTitle>
            <div className="text-2xl font-bold">{diff.pageOverlap?.shared ?? 0}</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-muted-foreground">Issues before</CardTitle>
            <div className="text-2xl font-bold">{summary.fromTotal ?? 0}</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-muted-foreground">Issues after</CardTitle>
            <div className="text-2xl font-bold">{summary.toTotal ?? 0}</div>
          </CardHeader>
        </Card>
        <Card className="border-emerald-400/50">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-emerald-700 dark:text-emerald-400">Resolved</CardTitle>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{summary.resolved ?? 0}</div>
          </CardHeader>
        </Card>
        <Card className="border-red-400/50">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-red-700 dark:text-red-400">New</CardTitle>
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{summary.new ?? 0}</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-muted-foreground">Changed / unchanged</CardTitle>
            <div className="text-2xl font-bold">
              {summary.changed ?? 0}
              <span className="text-sm font-normal text-muted-foreground"> / {summary.unchanged ?? 0}</span>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Severity breakdown */}
      <div className="grid md:grid-cols-2 gap-4 text-sm">
        <div className="rounded-lg border border-border p-3">
          <p className="font-medium mb-2">Severity before</p>
          <div className="flex gap-3">
            <span>
              <Badge variant="destructive">{severityFrom.fail}</Badge> fail
            </span>
            <span>
              <Badge variant="warning">{severityFrom.warn}</Badge> warn
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="font-medium mb-2">Severity after</p>
          <div className="flex gap-3">
            <span>
              <Badge variant="destructive">{severityTo.fail}</Badge> fail
              {severityTo.fail !== severityFrom.fail && (
                <span className={cn('ml-1 text-xs', deltaClass(severityTo.fail - severityFrom.fail))}>
                  ({formatDelta(severityTo.fail - severityFrom.fail)})
                </span>
              )}
            </span>
            <span>
              <Badge variant="warning">{severityTo.warn}</Badge> warn
              {severityTo.warn !== severityFrom.warn && (
                <span className={cn('ml-1 text-xs', deltaClass(severityFrom.warn - severityTo.warn))}>
                  ({formatDelta(severityTo.warn - severityFrom.warn)})
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Category comparison table */}
      {diff.categoryDeltas?.length > 0 && (
        <div>
          <p className="font-medium mb-2">Category scores</p>
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-3 py-2 font-medium">Category</th>
                  <th className="text-right px-3 py-2 font-medium">Before</th>
                  <th className="text-right px-3 py-2 font-medium">After</th>
                  <th className="text-right px-3 py-2 font-medium">Delta</th>
                </tr>
              </thead>
              <tbody>
                {diff.categoryDeltas.map((row: any) => (
                  <tr key={row.key} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      {CATEGORY_META[row.key as FindingCategory]?.label ?? row.key}
                    </td>
                    <td className={cn('px-3 py-2 text-right font-medium', scoreClass(row.from))}>{row.from}</td>
                    <td className={cn('px-3 py-2 text-right font-medium', scoreClass(row.to))}>{row.to}</td>
                    <td className={cn('px-3 py-2 text-right font-bold', deltaClass(row.delta))}>
                      {formatDelta(row.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Page status changes */}
      {pageChanges.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPageChanges((v) => !v)}
            className="flex items-center gap-2 font-medium text-sm mb-2 hover:text-primary"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', showPageChanges && 'rotate-180')} />
            Page status changes ({pageChanges.length})
          </button>
          {showPageChanges && (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-3 py-2 font-medium">URL</th>
                    <th className="text-left px-3 py-2 font-medium">Before</th>
                    <th className="text-left px-3 py-2 font-medium">After</th>
                  </tr>
                </thead>
                <tbody>
                  {pageChanges.map((row: any) => (
                    <tr key={row.url} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline break-all inline-flex items-center gap-1"
                        >
                          {row.url}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </td>
                      <td className="px-3 py-2">
                        {row.fromStatus}
                        {row.fromStatusCode != null && ` (${row.fromStatusCode})`}
                      </td>
                      <td className="px-3 py-2">
                        {row.toStatus}
                        {row.toStatusCode != null && ` (${row.toStatusCode})`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Issue lists */}
      <div className="grid lg:grid-cols-3 gap-6">
        <IssueGroupList title="Resolved" items={diff.resolved || []} />
        <IssueGroupList title="New issues" items={diff.newIssues || []} />
        <ChangedGroupList items={diff.changed || []} />
      </div>
    </div>
  );
}
