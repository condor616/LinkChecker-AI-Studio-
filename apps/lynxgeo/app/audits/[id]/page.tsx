'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { collectAuditFindings, groupCriteria } from '@/lib/geo/score';
import { AuditChecks } from './audit-checks';
import { AuditLiveProgress } from './audit-progress';

export default function AuditReportPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [compareId, setCompareId] = useState('');
  const [diff, setDiff] = useState<any>(null);
  const [controlBusy, setControlBusy] = useState(false);
  const [controlError, setControlError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = () => {
    fetch(`/api/audits/${id}`)
      .then((r) => r.json())
      .then(setData);
  };

  useEffect(() => {
    load();
    fetch('/api/audits')
      .then((r) => r.json())
      .then((d) => setHistory((d.audits || []).filter((a: any) => a.id !== id && a.status === 'COMPLETED')));
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [id]);

  const runCompare = async () => {
    const res = await fetch(`/api/audits/${compareId}/compare?other=${id}`);
    setDiff(await res.json());
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

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p
            className={`text-xs uppercase tracking-widest font-bold ${
              failed || cancelled ? 'text-destructive' : paused ? 'text-amber-700 dark:text-amber-400' : 'text-primary'
            } ${running ? 'animate-pulse' : ''}`}
          >
            {audit.status}
          </p>
          <h1 className="text-3xl font-black">{audit.name}</h1>
          <p className="text-muted-foreground">{audit.startUrl}</p>
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

      {audit.status === 'COMPLETED' && (
        <div className="flex gap-2">
          <a href={`/api/audits/${id}/export?format=json`}>
            <Button variant="outline" size="sm">JSON</Button>
          </a>
          <a href={`/api/audits/${id}/export?format=csv`}>
            <Button variant="outline" size="sm">CSV</Button>
          </a>
          <a href={`/api/audits/${id}/export?format=html`}>
            <Button variant="outline" size="sm">HTML</Button>
          </a>
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

      <Card>
        <CardHeader>
          <CardTitle>Compare with a previous snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <select
              className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={compareId}
              onChange={(e) => setCompareId(e.target.value)}
            >
              <option value="">Select earlier audit</option>
              {history.map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.createdAt).toLocaleString()} — {a.score ?? '—'} ({a.scoreModelVersion})
                </option>
              ))}
            </select>
            <Button type="button" onClick={runCompare} disabled={!compareId}>
              Diff
            </Button>
          </div>
          {diff?.rubricChanged && (
            <p className="text-sm text-destructive">
              Score model changed between these snapshots — numeric delta is not comparable.
            </p>
          )}
          {diff && !diff.error && (
            <p className="text-sm">
              Score delta: <strong>{diff.scoreDelta}</strong>. Resolved issues: {diff.resolved?.length ?? 0}. New issues:{' '}
              {diff.newIssues?.length ?? 0}.
            </p>
          )}
        </CardContent>
      </Card>

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
