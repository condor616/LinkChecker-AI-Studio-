'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { collectAuditFindings, groupCriteria } from '@/lib/geo/score';
import {
  isRerun,
  resolveBaselineAuditId,
  resolveSeriesId,
  runLabelForIndex,
} from '@/lib/geo/series';
import { AuditChecks } from './audit-checks';
import { AuditLiveProgress } from './audit-progress';

function runLabel(run: { id: string; baselineAuditId?: string | null }, index: number): string {
  return runLabelForIndex(run, index);
}

export default function AuditReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [compareId, setCompareId] = useState('');
  const [controlBusy, setControlBusy] = useState(false);
  const [rerunBusy, setRerunBusy] = useState(false);
  const [controlError, setControlError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = () => {
    fetch(`/api/audits/${id}`)
      .then((r) => r.json())
      .then(setData);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [id]);

  const seriesRuns = useMemo(() => {
    const runs = data?.seriesRuns || [];
    return [...runs].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [data?.seriesRuns]);

  const baselineAuditId = useMemo(() => {
    if (!data?.audit) return id;
    return resolveBaselineAuditId(data.audit);
  }, [data?.audit, id]);

  const viewingRerun = useMemo(() => {
    if (!data?.audit) return false;
    return isRerun(data.audit);
  }, [data?.audit]);

  const comparableHistory = useMemo(() => {
    if (!data?.audit) return [];
    const seriesId = resolveSeriesId(data.audit);
    return seriesRuns.filter(
      (a: any) => a.id !== id && a.status === 'COMPLETED' && resolveSeriesId(a) === seriesId,
    );
  }, [data?.audit, seriesRuns, id]);

  const seriesIndex = useMemo(() => {
    const idx = seriesRuns.findIndex((a: any) => a.id === id);
    return idx >= 0 ? idx + 1 : null;
  }, [seriesRuns, id]);

  const rerunAudit = async () => {
    setRerunBusy(true);
    setControlError('');
    try {
      const res = await fetch(`/api/audits/${id}/rerun`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to re-run audit');
      router.push(`/audits/${json.id}`);
    } catch (err: any) {
      setControlError(err.message || 'Failed to re-run audit');
    } finally {
      setRerunBusy(false);
    }
  };

  const patchStatus = async (status: 'PAUSED' | 'RUNNING' | 'CANCELLED') => {
    setControlBusy(true);
    setControlError('');
    try {
      const res = await fetch(`/api/audits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update audit');
      if (json.audit) {
        setData((prev: any) => ({ ...prev, audit: json.audit }));
      } else {
        load();
      }
      setConfirmCancel(false);
    } catch (err: any) {
      setControlError(err.message || 'Failed to update audit');
    } finally {
      setControlBusy(false);
    }
  };

  const categories = useMemo(() => {
    try {
      return JSON.parse(data?.audit?.categoryScores || '{}');
    } catch {
      return {};
    }
  }, [data?.audit?.categoryScores]);

  const criteria = useMemo(() => {
    const findings = collectAuditFindings({
      pages: data?.pages,
      snapshotFindings: data?.snapshot?.findings,
      playbook: Array.isArray(categories.playbook) ? categories.playbook : [],
    });
    return groupCriteria(findings, { baseUrl: data?.audit?.startUrl });
  }, [data?.pages, data?.snapshot, categories.playbook, data?.audit?.startUrl]);

  if (!data?.audit) return <div className="p-8">Loading…</div>;
  const audit = data.audit;
  const running = audit.status === 'RUNNING';
  const failed = audit.status === 'FAILED';
  const paused = audit.status === 'PAUSED';
  const cancelled = audit.status === 'CANCELLED';
  const canControl = running || paused;
  const completed = audit.status === 'COMPLETED';

  return (
    <div className="w-full max-w-[1600px] mx-auto p-8 space-y-6">
      {viewingRerun && (
        <Link
          href={`/audits/${baselineAuditId}`}
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to discovery scan
        </Link>
      )}

      <div className="flex items-end justify-between gap-4">
        <div>
          <p
            className={`text-xs uppercase tracking-widest font-bold ${
              failed || cancelled ? 'text-destructive' : paused ? 'text-amber-700 dark:text-amber-400' : 'text-primary'
            } ${running ? 'animate-pulse' : ''}`}
          >
            {audit.status}
            {viewingRerun && (
              <span className="ml-2 normal-case tracking-normal font-medium text-muted-foreground">
                · Re-run
              </span>
            )}
          </p>
          <h1 className="text-3xl font-black">{audit.name}</h1>
          <p className="text-muted-foreground">{audit.startUrl}</p>
          {seriesRuns.length > 1 && seriesIndex != null && (
            <p className="text-xs text-muted-foreground mt-1">
              {runLabel(audit, seriesIndex - 1)} · {seriesIndex} of {seriesRuns.length} in this series
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-5xl font-black text-primary">{audit.score ?? '—'}</div>
          <div className="text-xs text-muted-foreground">
            {cancelled
              ? 'cancelled — no snapshot'
              : paused
                ? 'paused — resume to continue'
                : audit.scoreModelVersion || 'scoring…'}
          </div>
        </div>
      </div>

      {seriesRuns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {seriesRuns.length > 1 ? 'Audit series' : 'Discovery scan'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {seriesRuns.length > 1 && (
              <p className="text-xs text-muted-foreground">
                All runs on the same pinned pages, ordered oldest to newest. Re-runs are created from
                the discovery scan or any prior run in this series.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {seriesRuns.map((run: any, index: number) => {
                const isCurrent = run.id === id;
                const canCompare = !isCurrent && run.status === 'COMPLETED' && completed;
                return (
                  <span key={run.id} className="inline-flex items-center gap-1">
                    <Link
                      href={`/audits/${run.id}`}
                      className={`text-xs rounded-md border px-2 py-1 ${
                        isCurrent
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-primary/40'
                      }`}
                    >
                      {runLabel(run, index)}: {run.score ?? '—'} · {new Date(run.createdAt).toLocaleString()}
                    </Link>
                    {canCompare && (
                      <Link
                        href={`/audits/${id}/compare?from=${run.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Compare
                      </Link>
                    )}
                  </span>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <AuditLiveProgress audit={audit} />

      {canControl && (
        <div className="flex flex-wrap items-center gap-2">
          {running && (
            <Button type="button" variant="outline" size="sm" disabled={controlBusy} onClick={() => patchStatus('PAUSED')}>
              {controlBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pause'}
            </Button>
          )}
          {paused && (
            <Button type="button" size="sm" disabled={controlBusy} onClick={() => patchStatus('RUNNING')}>
              {controlBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resume'}
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={controlBusy}
            onClick={() => setConfirmCancel(true)}
          >
            Stop
          </Button>
          {controlError && <p className="text-sm text-destructive">{controlError}</p>}
        </div>
      )}

      {completed && (
        <div className="flex flex-wrap gap-2 items-center">
          <Button type="button" size="sm" disabled={rerunBusy} onClick={rerunAudit}>
            {rerunBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Re-run audit
          </Button>
          <span className="text-xs text-muted-foreground">
            Re-scans the same pages and adds a new run to this series
          </span>
          <a href={`/api/audits/${id}/export?format=json`}>
            <Button variant="outline" size="sm">JSON</Button>
          </a>
          <a href={`/api/audits/${id}/export?format=csv`}>
            <Button variant="outline" size="sm">CSV</Button>
          </a>
          <a href={`/api/audits/${id}/export?format=html`}>
            <Button variant="outline" size="sm">HTML</Button>
          </a>
          {controlError && <p className="text-sm text-destructive w-full">{controlError}</p>}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {['crawlAccess', 'extractability', 'negotiation', 'discovery', 'citeability'].map((key) => {
          const score = categories[key];
          const tone =
            typeof score !== 'number'
              ? 'border-border'
              : score >= 80
                ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                : score >= 60
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/35'
                  : 'border-red-400 bg-red-50 dark:bg-red-950/40';
          const scoreClass =
            typeof score !== 'number'
              ? 'text-foreground'
              : score >= 80
                ? 'text-emerald-700 dark:text-emerald-400'
                : score >= 60
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-red-700 dark:text-red-400';
          return (
            <Card key={key} className={tone}>
              <CardHeader className="p-4">
                <CardTitle className="text-xs uppercase text-muted-foreground">{key}</CardTitle>
                <div className={`text-2xl font-bold ${scoreClass}`}>{score ?? '—'}</div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <AuditChecks criteria={criteria} startUrl={audit.startUrl} />

      {completed && comparableHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Compare with a previous run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <select
                className="flex-1 min-w-[200px] h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={compareId}
                onChange={(e) => setCompareId(e.target.value)}
              >
                <option value="">Select earlier run…</option>
                {comparableHistory.map((a: any) => {
                  const idx = seriesRuns.findIndex((r: any) => r.id === a.id);
                  return (
                    <option key={a.id} value={a.id}>
                      {runLabel(a, idx)} — {new Date(a.createdAt).toLocaleString()} — {a.score ?? '—'}
                    </option>
                  );
                })}
              </select>
              <Button
                type="button"
                size="sm"
                disabled={!compareId}
                onClick={() => router.push(`/audits/${id}/compare?from=${compareId}`)}
              >
                Compare
              </Button>
              <Link
                href={`/audits/${id}/compare`}
                className="text-xs text-primary hover:underline"
              >
                Open compare page
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Link href="/audits/history" className="text-sm text-primary">
        Back to history
      </Link>

      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-destructive">
                <div className="p-2 bg-destructive/10 rounded-full">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground">Stop this audit?</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                The worker will finish the current fetch, then stop. Remaining URLs are discarded and no snapshot is
                saved. This cannot be resumed.
              </p>
              {controlError && <p className="text-sm text-destructive">{controlError}</p>}
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!controlBusy) setConfirmCancel(false);
                  }}
                  disabled={controlBusy}
                >
                  Keep running
                </Button>
                <Button variant="destructive" onClick={() => patchStatus('CANCELLED')} disabled={controlBusy}>
                  {controlBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Stop audit'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
