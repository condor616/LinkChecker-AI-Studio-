'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, LayoutTemplate, Play, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GEO_TEMPLATE_STORAGE_KEY } from '@/lib/geo/template-storage';

type AuditTemplate = {
  id: string;
  name: string;
  config: string;
  createdAt: string;
};

function parseConfig(config: string | Record<string, unknown> | undefined) {
  try {
    return typeof config === 'string' ? JSON.parse(config || '{}') : config || {};
  } catch {
    return {};
  }
}

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<AuditTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.error || 'Failed to load templates');
      setTemplates(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const deleteTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      if (res.ok) setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const useTemplate = (template: AuditTemplate) => {
    const raw = typeof template.config === 'string' ? template.config : JSON.stringify(template.config);
    localStorage.setItem(GEO_TEMPLATE_STORAGE_KEY, raw);
    router.push('/audits/new');
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-primary font-bold">Presets</p>
          <h1 className="text-3xl font-black tracking-tight mt-1">Audit templates</h1>
          <p className="text-muted-foreground mt-1">
            Save crawler configs and reuse them on a new GEO audit. Templates live in your Lynx GEO database.
          </p>
        </div>
        <Button onClick={() => router.push('/audits/new')}>
          <Plus className="mr-2 h-4 w-4" />
          New template
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-24 bg-muted/50" />
              <CardContent className="h-32" />
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card className="p-16 text-center space-y-4 border-dashed border-primary/30">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <LayoutTemplate className="h-8 w-8 text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold">No templates yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Configure a crawl on New audit, then save it as a template to reuse later.
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push('/audits/new')}>
            Create your first template
          </Button>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const cfg = parseConfig(template.config);
            return (
              <Card key={template.id} className="flex flex-col h-full hover:border-primary/50 transition-colors">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span className="truncate">{template.name}</span>
                    <LayoutTemplate className="h-4 w-4 text-primary shrink-0" />
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Saved {new Date(template.createdAt).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  <div className="bg-primary/5 rounded-lg p-4 space-y-2 text-sm border border-primary/15">
                    <div className="flex justify-between items-center gap-4">
                      <span className="text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                        Start URL
                      </span>
                      <span className="truncate flex-1 text-right font-medium">{cfg.startUrl || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                        Max depth
                      </span>
                      <span className="font-medium">{cfg.maxDepth === 0 ? '∞ (Unlimited)' : cfg.maxDepth ?? 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                        Max pages
                      </span>
                      <span className="font-medium">
                        {!cfg.maxPages || Number(cfg.maxPages) <= 0 ? '∞ (Unlimited)' : cfg.maxPages}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                        Rate limit
                      </span>
                      <span className="font-medium">{cfg.rateLimit || 60} req/min</span>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button className="flex-1 h-10" onClick={() => useTemplate(template)}>
                      <Play className="mr-2 h-4 w-4" />
                      Use
                    </Button>
                    <Button variant="outline" size="sm" className="h-10 px-4" onClick={() => router.push(`/audits/new?edit=${template.id}`)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-destructive hover:bg-destructive/10"
                      onClick={() => deleteTemplate(template.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
