'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  auditId: string;
  startUrl: string;
  onDismissed: () => void;
  onChecked: () => void;
};

export function NewsListingDatePrompt({ auditId, startUrl, onDismissed, onChecked }: Props) {
  const [articleUrl, setArticleUrl] = useState('');
  const [busy, setBusy] = useState<'check' | 'cancel' | null>(null);
  const [error, setError] = useState('');

  const originHint = (() => {
    try {
      return new URL(startUrl).hostname.replace(/^www\./, '');
    } catch {
      return 'example.com';
    }
  })();

  const canCheck = Boolean(articleUrl.trim());

  const check = async () => {
    setBusy('check');
    setError('');
    try {
      const res = await fetch(`/api/audits/${auditId}/date-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleUrl: articleUrl.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to check date markup');
      onChecked();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to check date markup');
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy('cancel');
    setError('');
    try {
      const res = await fetch(`/api/audits/${auditId}/date-check/dismiss`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to cancel');
      onDismissed();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to cancel');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-amber-400 bg-amber-50/80 dark:bg-amber-950/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Date metatags were not checked</CardTitle>
        <CardDescription className="text-sm text-foreground/80">
          We could not identify news or article pages on this crawl, so date markup was skipped. Paste{' '}
          <strong>one sample news article URL</strong> (may be on a news subdomain such as{' '}
          <code className="text-xs">news.{originHint}</code>). We will check date metatags on that page and update
          this report — or Cancel to skip (the warn stays in the criteria).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="news-article-url">Sample article URL</Label>
          <Input
            id="news-article-url"
            type="url"
            placeholder={`https://news.${originHint}/…`}
            value={articleUrl}
            onChange={(e) => setArticleUrl(e.target.value)}
            disabled={busy !== null}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button type="button" size="sm" disabled={busy !== null || !canCheck} onClick={check}>
            {busy === 'check' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={cancel}>
            {busy === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel'}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
