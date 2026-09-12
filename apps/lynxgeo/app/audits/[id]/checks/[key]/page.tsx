'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { collectAuditFindings, groupCriteria } from '@/lib/geo/score';
import { parseCategoryScoresBlob } from '@/lib/geo/news-listing-prompt';
import { CheckDetailBody, severityBadge } from '../../check-detail-body';

export default function AuditCheckDetailPage() {
  const { id, key: keyParam } = useParams<{ id: string; key: string }>();
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';
  const checkKey = decodeURIComponent(keyParam || '');

  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/audits/${id}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Failed to load audit');
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load audit');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const criteria = useMemo(() => {
    if (!data?.audit) return [];
    const categories = parseCategoryScoresBlob(data.audit.categoryScores);
    const findings = collectAuditFindings({
      pages: data?.pages,
      snapshotFindings: data?.snapshot?.findings,
      playbook: Array.isArray(categories.playbook) ? categories.playbook : [],
    });
    return groupCriteria(findings, { baseUrl: data?.audit?.startUrl });
  }, [data]);

  const criterion = useMemo(() => criteria.find((c) => c.key === checkKey), [criteria, checkKey]);

  if (error) {
    return (
      <div className="w-full max-w-[1600px] mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-4">
        <Link href={`/audits/${id}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to report
        </Link>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!data?.audit) {
    return <div className="px-4 py-6 sm:p-8">Loading…</div>;
  }

  if (!criterion) {
    return (
      <div className="w-full max-w-[1600px] mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-4">
        <Link href={`/audits/${id}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to report
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Check not found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              No check named <code className="text-xs">{checkKey}</code> on this audit.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-6">
      <Link href={`/audits/${id}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" />
        Back to report
      </Link>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{data.audit.name}</p>
        <h1 className="text-2xl sm:text-3xl font-black break-words">{criterion.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {criterion.counts.fail > 0 && severityBadge('fail', criterion.counts.fail)}
          {criterion.counts.warn > 0 && severityBadge('warn', criterion.counts.warn)}
          {criterion.counts.pass > 0 && severityBadge('pass', criterion.counts.pass)}
          {criterion.standard && (
            <Badge variant="outline" className="font-normal">
              {criterion.standard}
            </Badge>
          )}
        </div>
        {query.trim() && (
          <p className="text-xs text-muted-foreground">
            Filtered for <span className="font-mono">{query.trim()}</span>
          </p>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <CheckDetailBody criterion={criterion} startUrl={data.audit.startUrl} query={query} />
        </CardContent>
      </Card>
    </div>
  );
}
