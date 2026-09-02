'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, GitCompare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { resolveSeriesId, runLabelForIndex } from '@/lib/geo/series';
import { ComparePanel } from '../compare-panel';

function runLabel(run: { id: string; baselineAuditId?: string | null }, index: number): string {
  return runLabelForIndex(run, index);
}

export default function AuditComparePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get('from') || '';

  const [data, setData] = useState<any>(null);
  const [compareId, setCompareId] = useState(fromParam);
  const [diff, setDiff] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    fetch(`/api/audits/${id}`)
      .then((r) => r.json())
      .then(setData);
  }, [id]);

  const seriesRuns = useMemo(() => {
    const runs = data?.seriesRuns || [];
    return [...runs].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [data?.seriesRuns]);

  const comparableHistory = useMemo(() => {
    if (!data?.audit) return [];
    const seriesId = resolveSeriesId(data.audit);
    return seriesRuns.filter(
      (a: any) => a.id !== id && a.status === 'COMPLETED' && resolveSeriesId(a) === seriesId,
    );
  }, [data?.audit, seriesRuns, id]);

  const runCompare = useCallback(async (baselineId: string) => {
    if (!baselineId) return;
    setLoading(true);
    setLoadError('');
    setDiff(null);
    try {
      const res = await fetch(`/api/audits/${baselineId}/compare?other=${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Compare failed');
      setDiff(json);
    } catch (err: any) {
      setLoadError(err.message || 'Compare failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (fromParam && data?.audit?.status === 'COMPLETED') {
      setCompareId(fromParam);
      runCompare(fromParam);
    }
  }, [fromParam, data?.audit?.status, runCompare]);

  const handleCompare = () => {
    if (!compareId) return;
    router.replace(`/audits/${id}/compare?from=${compareId}`, { scroll: false });
    runCompare(compareId);
  };

  const pageTitle = useMemo(() => {
    if (diff && !diff.error) {
      return `Compare: ${diff.from?.runLabel} → ${diff.to?.runLabel}`;
    }
    if (compareId && data?.audit) {
      const fromIdx = seriesRuns.findIndex((r: any) => r.id === compareId);
      const toIdx = seriesRuns.findIndex((r: any) => r.id === id);
      if (fromIdx >= 0 && toIdx >= 0) {
        return `Compare: ${runLabel(seriesRuns[fromIdx], fromIdx)} → ${runLabel(seriesRuns[toIdx], toIdx)}`;
      }
    }
    return 'Compare snapshots';
  }, [diff, compareId, data?.audit, seriesRuns, id]);

  if (!data?.audit) return <div className="p-8">Loading…</div>;
  const audit = data.audit;
  const completed = audit.status === 'COMPLETED';

  return (
    <div className="w-full max-w-[1600px] mx-auto p-8 space-y-6">
      <Link
        href={`/audits/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to audit report
      </Link>

      <div>
        <p className="text-xs uppercase tracking-widest font-bold text-primary">Snapshot compare</p>
        <h1 className="text-3xl font-black">{pageTitle}</h1>
        <p className="text-muted-foreground">{audit.name} · {audit.startUrl}</p>
      </div>

      {!completed && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              This audit is still {audit.status.toLowerCase()}. Compare is available once it completes.
            </p>
          </CardContent>
        </Card>
      )}

      {completed && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5" />
              Select baseline run
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Compare within the same audit series to track progress on the same pages and criteria.
            </p>
            <div className="flex gap-2">
              <select
                className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={compareId}
                onChange={(e) => setCompareId(e.target.value)}
              >
                <option value="">Select earlier run in this series</option>
                {comparableHistory.map((a: any) => {
                  const idx = seriesRuns.findIndex((r: any) => r.id === a.id);
                  return (
                    <option key={a.id} value={a.id}>
                      {runLabel(a, idx)} — {new Date(a.createdAt).toLocaleString()} — {a.score ?? '—'} ({a.scoreModelVersion})
                    </option>
                  );
                })}
              </select>
              <Button type="button" onClick={handleCompare} disabled={!compareId || loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Compare'}
              </Button>
            </div>

            {comparableHistory.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No earlier completed runs in this series. Use &quot;Re-run audit&quot; on the report page to create a comparable follow-up.
              </p>
            )}

            {loadError && <p className="text-sm text-destructive">{loadError}</p>}
            {diff?.error && <p className="text-sm text-destructive">{diff.error}</p>}
          </CardContent>
        </Card>
      )}

      {loading && !diff && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading comparison…
        </div>
      )}

      {diff && !diff.error && !loading && <ComparePanel diff={diff} />}
    </div>
  );
}
