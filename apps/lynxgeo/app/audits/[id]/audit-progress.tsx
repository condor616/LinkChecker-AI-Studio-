'use client';

import { Globe, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  auditProgressPercent,
  isUnlimitedPages,
  parseAuditProgress,
  type AuditPhase,
} from '@/lib/geo/progress';

const PHASE_CHIPS: { id: AuditPhase; label: string }[] = [
  { id: 'robots.txt', label: 'robots.txt' },
  { id: 'sitemap', label: 'sitemap' },
  { id: 'crawl', label: 'crawl' },
  { id: 'scoring', label: 'scoring' },
  { id: 'snapshot', label: 'snapshot' },
];

function phaseIndex(phase: AuditPhase | undefined) {
  if (!phase) return -1;
  if (phase === 'done') return PHASE_CHIPS.length;
  return PHASE_CHIPS.findIndex((p) => p.id === phase);
}

export function AuditLiveProgress({
  audit,
}: {
  audit: { status: string; progress?: string | null };
}) {
  const progress = parseAuditProgress(audit.progress);
  const running = audit.status === 'RUNNING';
  const failed = audit.status === 'FAILED';
  const completed = audit.status === 'COMPLETED';
  const paused = audit.status === 'PAUSED';
  const cancelled = audit.status === 'CANCELLED';

  if (completed && !progress) return null;
  if (!running && !failed && !paused && !cancelled && !progress) return null;

  const pagesFetched = progress?.pagesFetched ?? 0;
  const maxPages = progress?.maxPages ?? 0;
  const unlimited = isUnlimitedPages(maxPages);
  const pct = auditProgressPercent(progress, audit.status);
  const indeterminate = pct == null && running;
  const message =
    progress?.message ||
    (running
      ? 'Starting audit…'
      : paused
        ? 'Audit paused'
        : cancelled
          ? 'Audit cancelled'
          : failed
            ? 'Audit failed'
            : 'Crawled');
  const currentUrl = progress?.currentUrl || null;
  const idx = phaseIndex(progress?.phase);

  return (
    <Card
      className={cn(
        'overflow-hidden',
        running && 'border-primary/35 bg-primary/5',
        paused && 'border-amber-400/40 bg-amber-50 dark:bg-amber-950/30',
        (failed || cancelled) && 'border-destructive/30 bg-destructive/5',
      )}
    >
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {running
                ? 'Live progress'
                : paused
                  ? 'Paused'
                  : cancelled
                    ? 'Cancelled'
                    : failed
                      ? 'Stopped'
                      : 'Crawl complete'}
            </p>
            <p className="text-sm font-semibold text-foreground break-all">
              {running && (
                <Loader2 className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5 animate-spin text-primary" />
              )}
              {message}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-black tabular-nums text-primary leading-none">
              {completed ? '100%' : unlimited ? pagesFetched : `${pagesFetched} / ${maxPages}`}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
              {completed ? `${pagesFetched} pages` : unlimited ? 'pages (no cap)' : 'pages vs cap'}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="h-2 rounded-full bg-muted overflow-hidden border border-border">
            <div
              className={cn(
                'h-full rounded-full',
                failed || cancelled ? 'bg-destructive' : 'bg-primary',
                indeterminate && 'w-1/3 animate-pulse',
                !indeterminate && 'transition-[width] duration-500 ease-out',
              )}
              style={indeterminate ? undefined : { width: `${pct ?? 0}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <span>{completed ? '100%' : indeterminate ? 'in progress' : `${pct ?? 0}%`}</span>
            <span>{unlimited ? 'No page cap' : `${maxPages} page cap`}</span>
          </div>
        </div>

        {(running || failed || paused || cancelled) && (
          <div className="flex flex-wrap gap-1.5">
            {PHASE_CHIPS.map((p, i) => {
              const active = progress?.phase === p.id;
              const done = idx > i;
              return (
                <span
                  key={p.id}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                    active && 'border-primary/40 bg-primary/15 text-primary',
                    done && !active && 'border-primary/20 text-primary/70',
                    !active && !done && 'border-border text-muted-foreground',
                  )}
                >
                  {p.label}
                </span>
              );
            })}
          </div>
        )}

        {currentUrl && (running || paused) && (
          <p className="text-xs font-mono text-muted-foreground truncate flex items-center gap-1.5">
            <Globe className="h-3 w-3 shrink-0 text-primary" />
            {currentUrl}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
