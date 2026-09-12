'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatAppDateTime, formatAppDateTimeCompact } from '@/lib/format-datetime';
import {
  countRerunsForMain,
  isDateCheckAudit,
  isHistorySeriesRun,
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

  /** One history row per discovery scan — never list re-runs or date-checks as top-level entries. */
  const mainScans = useMemo(
    () => audits.filter((audit) => isMainScan(audit) && !isDateCheckAudit(audit)),
    [audits],
  );

  const seriesRunsById = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const audit of audits) {
      if (!isHistorySeriesRun(audit)) continue;
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
      const seriesId = resolveSeriesId(pendingDelete);
      setAudits((prev) =>
        prev.filter((a) => a.id !== pendingDelete.id && resolveSeriesId(a) !== seriesId),
      );
      setPendingDelete(null);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete audit');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-4">
      <h1 className="text-2xl sm:text-3xl font-bold">Audit history</h1>
      <p className="text-sm text-muted-foreground">
        Each entry is a discovery scan — the first full crawl of a site. Re-checks of the same pages are counted on
        that row and open from the report&apos;s series list. Starting a new audit (not a re-check) adds another
        entry here.
      </p>

      {sortedMainScans.map((main) => {
        const runs = seriesRunsById.get(resolveSeriesId(main)) || [main];
        const scored = runs.filter((a) => a.score != null);
        const rerunCount = countRerunsForMain(audits, main.id);
        const latestScored = [...scored].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0];
        const displayScore = latestScored?.score ?? main.score ?? '—';

        return (
          <div key={main.id} className="relative mb-3">
            <Card className="hover:border-primary/40">
              <Link href={`/audits/${main.id}`} className="block">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex justify-between items-start gap-3">
                    <span className="min-w-0 pr-2 flex items-center gap-2 flex-wrap">
                      {main.name}
                      {rerunCount > 0 && (
                        <span className="text-xs font-normal rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-primary">
                          {rerunCount} re-check{rerunCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </span>
                    <span className="text-primary pr-10">{displayScore}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground pb-3">
                  <div>
                    <span className="break-all">{main.startUrl}</span>
                    {' · '}
                    {main.status} · {main.scoreModelVersion || 'pending'} ·{' '}
                    {formatAppDateTime(main.createdAt)}
                  </div>
                </CardContent>
              </Link>
              {scored.length > 1 && (
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {scored.map((a, index) => {
                      const label = index === 0 ? 'Discovery' : `Re-check ${index}`;
                      return (
                        <Link
                          key={a.id}
                          href={`/audits/${a.id}`}
                          className="flex min-w-0 flex-col gap-0.5 rounded-md bg-primary/85 px-2.5 py-2 text-primary-foreground shadow-sm transition-colors hover:bg-primary"
                          title={`${label}: ${a.score ?? '—'} · ${formatAppDateTime(a.createdAt)}`}
                        >
                          <span className="text-[10px] font-medium uppercase tracking-wide opacity-90 truncate">
                            {label}
                          </span>
                          <span className="text-base font-bold leading-none">{a.score ?? '—'}</span>
                          <span className="text-[10px] leading-snug opacity-90 truncate">
                            {formatAppDateTimeCompact(a.createdAt)}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
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
                <span className="font-bold text-foreground">{pendingDelete.name}</span>? This discovery scan and its
                re-checks will be removed. This cannot be undone.
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
