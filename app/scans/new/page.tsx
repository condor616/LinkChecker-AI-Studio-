'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Play } from 'lucide-react';

interface ScanConfig {
  name: string;
  startUrl: string;
  maxDepth: number;
  rateLimit: number;
  excludeRegex: string;
}

export default function NewScanPage() {
  const router = useRouter();
  const [config, setConfig] = useState<ScanConfig>({
    name: 'My New Scan',
    startUrl: 'https://example.com',
    maxDepth: 2,
    rateLimit: 60,
    excludeRegex: '',
  });
  const [jsonText, setJsonText] = useState(JSON.stringify(config, null, 2));
  const [jsonError, setJsonError] = useState('');
  const [loading, setLoading] = useState(false);

  // Sync UI to JSON
  useEffect(() => {
    setJsonText(JSON.stringify(config, null, 2));
    setJsonError('');
  }, [config]);

  // Sync JSON to UI
  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setJsonText(val);
    try {
      const parsed = JSON.parse(val);
      setConfig(parsed);
      setJsonError('');
    } catch (err) {
      setJsonError('Invalid JSON format');
    }
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error('Failed to start scan');
      const data = await res.json();
      router.push(`/scans/${data.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Scan</h1>
        <p className="text-muted-foreground mt-1">Configure and start a new broken link scan.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Configuration UI</CardTitle>
            <CardDescription>Set your parameters visually.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Scan Name</Label>
              <Input
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Starting URL</Label>
              <Input
                type="url"
                value={config.startUrl}
                onChange={(e) => setConfig({ ...config, startUrl: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Depth (0 = unlimited)</Label>
                <Input
                  type="number"
                  min={0}
                  value={config.maxDepth}
                  onChange={(e) => setConfig({ ...config, maxDepth: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Rate Limit (req/min)</Label>
                <Input
                  type="number"
                  min={1}
                  value={config.rateLimit}
                  onChange={(e) => setConfig({ ...config, rateLimit: parseInt(e.target.value) || 60 })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Exclude Regex (optional)</Label>
              <Input
                placeholder="e.g. \.pdf$"
                value={config.excludeRegex}
                onChange={(e) => setConfig({ ...config, excludeRegex: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>JSON Editor</CardTitle>
            <CardDescription>Advanced configuration via JSON. Syncs bidirectionally.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              className="font-mono h-[300px] bg-muted/50"
              value={jsonText}
              onChange={handleJsonChange}
            />
            {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
            <Button onClick={handleStart} disabled={loading || !!jsonError} className="w-full">
              <Play className="mr-2 h-4 w-4" />
              {loading ? 'Starting...' : 'Start Scan'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
