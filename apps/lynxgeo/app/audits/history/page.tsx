'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

  const completed = audits.filter((a) => a.score != null);
  const maxScore = Math.max(100, ...completed.map((a) => a.score || 0));

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
    <div className="max-w-4xl mx-auto p-8 space-y-4">
      <h1 className="text-3xl font-bold">Audit history</h1>
      <p className="text-sm text-muted-foreground">
        Completed audits are frozen as append-only snapshots. Comparing two runs is only valid when{' '}
        <code>scoreModelVersion</code> matches.
      </p>
      {completed.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Score timeline</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end gap-2 h-32">
            {completed
              .slice()
              .reverse()
              .map((a) => (
                <Link key={a.id} href={`/audits/${a.id}`} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-primary/80"
                    style={{ height: `${Math.max(8, ((a.score || 0) / maxScore) * 96)}px` }}
                    title={`${a.score} (${a.scoreModelVersion})`}
                  />
                  <span className="text-[10px] text-muted-foreground truncate w-full text-center">{a.score}</span>
                </Link>
              ))}
          </CardContent>
        </Card>
      )}
      {audits.map((a) => (
        <div key={a.id} className="relative mb-3">
          <Link href={`/audits/${a.id}`} className="block">
            <Card className="hover:border-primary/40">
              <CardHeader>
                <CardTitle className="text-lg flex justify-between items-start gap-3">
                  <span className="min-w-0 pr-2">{a.name}</span>
                  <span className="text-primary pr-10">{a.score ?? '—'}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {a.startUrl} · {a.status} · {a.scoreModelVersion || 'pending'} · {new Date(a.createdAt).toLocaleString()}
              </CardContent>
            </Card>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            aria-label={`Delete audit ${a.name}`}
            onClick={(e) => openDelete(e, a)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {audits.length === 0 && <p className="text-muted-foreground">No audits yet.</p>}

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
