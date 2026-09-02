'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  countRerunsForMain,
  isMainScan,
  resolveSeriesId,
} from '@/lib/geo/series';

export default function HistoryPage() {
  const [audits, setAudits] = useState<any[]>([]);
  const [pendingDelete, setPendingDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    fetch('/api/audits')
      .then((r) => r.json())
      .then((d) => setAudits(d.audits || []));
  }, []);

  const mainScans = useMemo(
    () => audits.filter((audit) => isMainScan(audit)),
    [audits],
  );

  const seriesRunsById = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const audit of audits) {
      const key = resolveSeriesId(audit);
      const list = groups.get(key) || [];
      list.push(audit);
      groups.set(key, list);
    }
    for (const runs of groups.values()) {
      runs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    return groups;
  }, [audits]);

  const sortedMainScans = useMemo(
    () =>
      [...mainScans].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [mainScans],
  );

  const openDelete = (e: React.MouseEvent, audit: any) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteError('');
    setPendingDelete(audit);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/audits/${pendingDelete.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete audit');
      setAudits((prev) => prev.filter((a) => a.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete audit');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto p-8 space-y-4">
      <h1 className="text-3xl font-bold">Audit history</h1>
      <p className="text-sm text-muted-foreground">
        Each entry is a discovery scan — the first full crawl of a site. Re-runs of the same pages
        appear on that scan&apos;s report page so you can track progress over time without cluttering
        this list.
      </p>

      {sortedMainScans
        .filter((main) => {
          const runs = seriesRunsById.get(resolveSeriesId(main)) || [main];
          return runs.filter((a) => a.score != null).length > 1;
        })
        .map((main) => {
          const runs = seriesRunsById.get(resolveSeriesId(main)) || [main];
          const completed = runs.filter((a) => a.score != null);
          const maxScore = Math.max(100, ...completed.map((a) => a.score || 0));
          const rerunCount = countRerunsForMain(audits, main.id);
          return (
            <Card key={main.id}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <Link href={`/audits/${main.id}`} className="hover:text-primary">
                    {main.name}
                  </Link>
                  {rerunCount > 0 && (
                    <span className="text-xs font-normal rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                      {rerunCount} re-run{rerunCount === 1 ? '' : 's'}
                    </span>
                  )}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({completed.length} scored runs)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-end gap-2 h-32">
                {completed.map((a, index) => (
                  <Link key={a.id} href={`/audits/${a.id}`} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-primary/80"
                      style={{ height: `${Math.max(8, ((a.score || 0) / maxScore) * 96)}px` }}
                      title={`${index === 0 ? 'Discovery' : `Re-run ${index}`}: ${a.score} (${a.scoreModelVersion})`}
                    />
                    <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                      {index === 0 ? 'D' : `R${index}`}: {a.score}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          );
        })}

      {sortedMainScans.map((main) => {
        const rerunCount = countRerunsForMain(audits, main.id);
        return (
          <div key={main.id} className="relative mb-3">
            <Link href={`/audits/${main.id}`} className="block">
              <Card className="hover:border-primary/40">
                <CardHeader>
                  <CardTitle className="text-lg flex justify-between items-start gap-3">
                    <span className="min-w-0 pr-2 flex items-center gap-2 flex-wrap">
                      {main.name}
                      {rerunCount > 0 && (
                        <span className="text-xs font-normal rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-primary">
                          {rerunCount} re-run{rerunCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </span>
                    <span className="text-primary pr-10">{main.score ?? '—'}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {main.startUrl} · {main.status} · {main.scoreModelVersion || 'pending'} ·{' '}
                  {new Date(main.createdAt).toLocaleString()}
                </CardContent>
              </Card>
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              aria-label={`Delete audit ${main.name}`}
              onClick={(e) => openDelete(e, main)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}

      {mainScans.length === 0 && <p className="text-muted-foreground">No audits yet.</p>}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-destructive">
                <div className="p-2 bg-destructive/10 rounded-full">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground">Delete audit?</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete{' '}
                <span className="font-bold text-foreground">{pendingDelete.name}</span>? Pages and snapshots for this
                audit will be removed. This cannot be undone.
              </p>
              {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!isDeleting) {
                      setPendingDelete(null);
                      setDeleteError('');
                    }
                  }}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
