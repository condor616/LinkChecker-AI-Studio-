'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronRight, CircleAlert, CircleX, Copy, ExternalLink, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { checkRefForKey } from '@/lib/geo/check-refs';
import {
  CATEGORY_META,
  SCORED_CATEGORY_KEYS,
  type FindingCategory,
  type ReportCriterion,
} from '@/lib/geo/score';
import { checkDetailHref, criterionMatches, matchingSeverities, severityBadge } from './check-detail-body';

const CATEGORY_ORDER: FindingCategory[] = [...SCORED_CATEGORY_KEYS, 'capabilities'];

function criterionPassed(c: ReportCriterion): boolean {
  return c.counts.fail === 0 && c.counts.warn === 0 && c.counts.pass > 0;
}

function StatusIcon({ criterion }: { criterion: ReportCriterion }) {
  if (criterion.counts.fail > 0) {
    return <CircleX className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-label="Fail" />;
  }
  if (criterion.counts.warn > 0) {
    return <CircleAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-label="Warn" />;
  }
  return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Pass" />;
}

function SearchField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by page URL or check…"
        aria-label="Search checks"
        className="pl-10"
      />
    </div>
  );
}

function CopyAgentPrompt({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text.trim()) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-1.5"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // ignore clipboard errors
        }
      }}
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? 'Copied' : 'Copy agent prompt'}
    </Button>
  );
}

function CheckRow({
  criterion,
  auditId,
  query,
}: {
  criterion: ReportCriterion;
  auditId: string;
  query: string;
}) {
  const hitSevs = matchingSeverities(criterion, query);
  const docRef = checkRefForKey(criterion.key);
  const isSite = criterion.scope !== 'page';
  const agentPrompt =
    criterion.agentPrompt ||
    (criterion.suggestion
      ? `${criterion.suggestion}${docRef ? `\n\nReference: ${docRef.href}` : ''}`
      : '');
  const showPrompt = !criterionPassed(criterion) && Boolean(agentPrompt);

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-card">
      <div className="flex gap-3">
        <StatusIcon criterion={criterion} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-sm leading-tight">{criterion.title}</span>
            {criterion.counts.fail > 0 && severityBadge('fail', criterion.counts.fail)}
            {criterion.counts.warn > 0 && severityBadge('warn', criterion.counts.warn)}
            {criterionPassed(criterion) && severityBadge('pass', criterion.counts.pass)}
            {criterion.standard && (
              <Badge variant="outline" className="font-normal">
                {criterion.standard}
              </Badge>
            )}
            {criterion.informational && (
              <Badge variant="secondary" className="font-normal">
                informational
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
          {criterion.detail && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Observation: </span>
              {criterion.detail}
            </p>
          )}
          {criterion.why && isSite && (
            <p className="text-xs text-muted-foreground">{criterion.why}</p>
          )}
          {!criterionPassed(criterion) && criterion.suggestion && (
            <p className="text-sm">
              <span className="font-medium">How to fix: </span>
              {criterion.suggestion}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {docRef && (
              <a
                href={docRef.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2"
                onClick={(e) => e.stopPropagation()}
              >
                Learn more
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
            {showPrompt && <CopyAgentPrompt text={agentPrompt} />}
            <Link
              href={checkDetailHref(auditId, criterion.key, query)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              {isSite ? 'Details' : 'URLs & details'}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
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

  const filtered = useMemo(() => criteria.filter((c) => criterionMatches(c, query)), [criteria, query]);
  const searching = query.trim().length > 0;

  const byCategory = useMemo(() => {
    const map = new Map<FindingCategory, ReportCriterion[]>();
    for (const key of CATEGORY_ORDER) map.set(key, []);
    for (const c of filtered) {
      const list = map.get(c.category) || [];
      list.push(c);
      map.set(c.category, list);
    }
    return map;
  }, [filtered]);

  const totals = useMemo(() => {
    return criteria.reduce(
      (acc, c) => {
        if (criterionPassed(c)) acc.pass += 1;
        else if (c.counts.fail > 0) acc.fail += 1;
        else acc.warn += 1;
        return acc;
      },
      { pass: 0, warn: 0, fail: 0 },
    );
  }, [criteria]);

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
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{criteria.length} checks</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{totals.pass} passed</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-amber-700 dark:text-amber-400 font-semibold">{totals.warn} warn</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-red-700 dark:text-red-400 font-semibold">{totals.fail} fail</span>
          </p>
          {searching && (
            <p className="text-xs text-muted-foreground">
              {filtered.length === 0
                ? 'No checks mention that URL or title.'
                : `Showing ${filtered.length} check${filtered.length === 1 ? '' : 's'}.`}
            </p>
          )}
        </CardContent>
      </Card>

      {CATEGORY_ORDER.map((category) => {
        const rows = byCategory.get(category) || [];
        if (rows.length === 0) return null;
        const passed = rows.filter(criterionPassed).length;
        const meta = CATEGORY_META[category];
        const informational = Boolean(meta.informationalByDefault);
        return (
          <Card key={category}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <CardTitle className="text-lg">{meta.label}</CardTitle>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    <span className="font-semibold text-foreground">
                      {passed}/{rows.length}
                    </span>{' '}
                    passed
                  </span>
                  {informational && (
                    <Badge variant="secondary" className="font-normal">
                      informational unless advertised
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{meta.summary}</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {rows.map((c) => (
                <CheckRow key={c.key} criterion={c} auditId={auditId} query={query} />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
