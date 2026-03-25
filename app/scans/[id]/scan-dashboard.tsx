'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pause, Play, RefreshCw, ExternalLink } from 'lucide-react';

export function ScanDashboard({ scanId, initialStatus }: { scanId: string, initialStatus: string }) {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState(initialStatus);

  const fetchData = async () => {
    const res = await fetch(`/api/scans/${scanId}`);
    if (res.ok) {
      const json = await res.json();
      setData(json);
      setStatus(json.scan.status);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [scanId]);

  const toggleStatus = async () => {
    const newStatus = status === 'RUNNING' ? 'PAUSED' : 'RUNNING';
    await fetch(`/api/scans/${scanId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setStatus(newStatus);
    fetchData();
  };

  if (!data) return <div>Loading...</div>;

  const { links } = data;
  const total = links.length;
  const pending = links.filter((l: any) => l.status === 'PENDING').length;
  const success = links.filter((l: any) => l.status === 'SUCCESS').length;
  const broken = links.filter((l: any) => l.status === 'BROKEN').length;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Button onClick={toggleStatus} variant={status === 'RUNNING' ? 'secondary' : 'default'}>
          {status === 'RUNNING' ? <><Pause className="mr-2 h-4 w-4" /> Pause</> : <><Play className="mr-2 h-4 w-4" /> Resume</>}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Links</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Pending</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-500">{pending}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Success</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-500">{success}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Broken</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-500">{broken}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Broken Links</CardTitle>
        </CardHeader>
        <CardContent>
          {broken === 0 ? (
            <p className="text-muted-foreground">No broken links found yet.</p>
          ) : (
            <div className="space-y-4">
              {links.filter((l: any) => l.status === 'BROKEN').map((link: any) => (
                <div key={link.id} className="p-4 border rounded-lg bg-destructive/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <a href={link.url} target="_blank" rel="noreferrer" className="font-medium text-red-500 hover:underline flex items-center gap-2">
                      {link.url} <ExternalLink className="h-3 w-3" />
                    </a>
                    <span className="text-sm bg-red-500/20 text-red-500 px-2 py-1 rounded">
                      {link.statusCode || 'Error'}
                    </span>
                  </div>
                  {link.parentUrl && (
                    <p className="text-sm text-muted-foreground">
                      Found on: <a href={link.parentUrl} target="_blank" rel="noreferrer" className="hover:underline">{link.parentUrl}</a>
                    </p>
                  )}
                  {link.error && <p className="text-sm font-mono bg-background p-2 rounded border">{link.error}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
