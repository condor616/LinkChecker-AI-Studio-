'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { DEFAULT_USER_AGENT, USER_AGENTS } from '@/lib/crawler/agents';
import { GEO_TEMPLATE_STORAGE_KEY } from '@/lib/geo/template-storage';
import { Check, ChevronDown, Code, Copy, Filter, Globe, Key, LayoutTemplate, Play, Plus, Save, Shield, X } from 'lucide-react';

type SavedTemplate = {
  id: string;
  name: string;
  config: string | Record<string, unknown>;
  createdAt?: string;
};

type AuditConfig = {
  name: string;
  startUrl: string;
  maxDepth: number;
  maxPages: number;
  rateLimit: number;
  excludeRegex: string;
  userAgent: string;
  customUserAgent: string;
  randomDelay: number;
  auth?: { username?: string; password?: string };
  regexRules: string[];
  skipSelectors: string[];
  wildcardExclusions: string[];
  skipExternal: boolean;
  excludeSubdomains: boolean;
  doNotTraverseBackward: boolean;
  saveSkippedLinks: boolean;
  [key: string]: unknown;
};

const DEFAULT_CONFIG: AuditConfig = {
  name: 'Novartis GEO audit',
  startUrl: 'https://www.novartis.com/',
  maxDepth: 2,
  maxPages: 0,
  rateLimit: 60,
  excludeRegex: '',
  userAgent: DEFAULT_USER_AGENT,
  customUserAgent: '',
  randomDelay: 500,
  auth: { username: '', password: '' },
  regexRules: [],
  skipSelectors: [],
  wildcardExclusions: [],
  skipExternal: true,
  excludeSubdomains: true,
  doNotTraverseBackward: true,
  saveSkippedLinks: true,
};

const COMMON_SELECTORS = [
  { label: 'Header', value: 'header' },
  { label: 'Footer', value: 'footer' },
  { label: 'Nav', value: 'nav' },
  { label: 'Sidebar', value: 'aside' },
  { label: 'Ads', value: '.ads, .advertisement' },
  { label: 'Social', value: '.social-links' },
];

function startPathLabel(startUrl: string): string {
  try {
    const pathname = new URL(startUrl).pathname || '/';
    const cleaned = pathname.replace(/\/+$/, '');
    return !cleaned || cleaned === '/' ? '/' : `${cleaned}/`;
  } catch {
    return '';
  }
}

function payloadFromConfig(config: AuditConfig) {
  const { isTargeted: _isTargeted, targetUrls: _targetUrls, ...rest } = config as AuditConfig & {
    isTargeted?: boolean;
    targetUrls?: string[];
  };
  const payload: Record<string, unknown> = {
    ...rest,
    skipExternal: true,
    doNotTraverseBackward: true,
  };
  const username = config.auth?.username?.trim() || '';
  const password = config.auth?.password?.trim() || '';
  if (username && password) {
    payload.auth = { username, password };
  } else {
    delete payload.auth;
  }
  return payload;
}

export default function NewAuditPage() {
  const router = useRouter();
  const [config, setConfig] = useState<AuditConfig>(DEFAULT_CONFIG);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(DEFAULT_CONFIG, null, 2));
  const [jsonError, setJsonError] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateMessage, setTemplateMessage] = useState('');
  const isUpdatingFromJson = useRef(false);

  const applyParsedConfig = (parsed: Record<string, unknown>) => {
    const { isTargeted: _isTargeted, targetUrls: _targetUrls, ...rest } = parsed;
    const merged = {
      ...DEFAULT_CONFIG,
      ...rest,
      skipExternal: true,
      doNotTraverseBackward: true,
      maxPages: Number(rest.maxPages) > 0 ? Number(rest.maxPages) : 0,
    } as AuditConfig;
    if (!merged.auth) merged.auth = { username: '', password: '' };
    isUpdatingFromJson.current = true;
    setConfig(merged);
    setJsonText(JSON.stringify(merged, null, 2));
    setShowAuth(!!(merged.auth?.username || merged.auth?.password));
    setJsonError('');
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      if (!res.ok) return;
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch {
      // list is optional on this page
    }
  };

  useEffect(() => {
    fetchTemplates();
    const editId = new URLSearchParams(window.location.search).get('edit');
    const savedConfig = localStorage.getItem(GEO_TEMPLATE_STORAGE_KEY);
    const load = async () => {
      if (savedConfig) {
        try {
          const parsed = JSON.parse(savedConfig);
          applyParsedConfig(parsed);
          if (parsed.id) setEditingTemplateId(parsed.id);
        } catch {
          console.error('Failed to parse saved template config');
        }
        localStorage.removeItem(GEO_TEMPLATE_STORAGE_KEY);
        return;
      }
      if (!editId) return;
      try {
        const res = await fetch(`/api/templates/${editId}`);
        if (!res.ok) return;
        const template = await res.json();
        const parsed = typeof template.config === 'string' ? JSON.parse(template.config) : template.config;
        applyParsedConfig(parsed);
        setEditingTemplateId(editId);
        setTemplateName(template.name || parsed.name || '');
      } catch {
        console.error('Failed to load template for editing');
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!isUpdatingFromJson.current) {
      setJsonText(JSON.stringify(config, null, 2));
      setJsonError('');
    }
    isUpdatingFromJson.current = false;
  }, [config]);

  const handleJsonChange = (value: string) => {
    setJsonText(value);
    isUpdatingFromJson.current = true;
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      const { isTargeted: _isTargeted, targetUrls: _targetUrls, ...rest } = parsed;
      const next = { ...DEFAULT_CONFIG, ...rest, skipExternal: true, doNotTraverseBackward: true } as AuditConfig;
      setConfig(next);
      setJsonError('');
    } catch {
      setJsonError('Invalid JSON format');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (jsonError) return;
    setLoading(true);
    try {
      const res = await fetch('/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadFromConfig(config)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to start audit');
      router.push(`/audits/${data.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start audit');
    } finally {
      setLoading(false);
    }
  };

  const addListItem = (field: 'regexRules' | 'skipSelectors' | 'wildcardExclusions', value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setConfig((prev) => ({ ...prev, [field]: [...(prev[field] || []), trimmed] }));
  };

  const removeListItem = (field: 'regexRules' | 'skipSelectors' | 'wildcardExclusions', index: number) => {
    setConfig((prev) => ({
      ...prev,
      [field]: (prev[field] || []).filter((_, i) => i !== index),
    }));
  };

  const updateListItem = (field: 'regexRules' | 'skipSelectors' | 'wildcardExclusions', index: number, value: string) => {
    setConfig((prev) => {
      const next = [...(prev[field] || [])];
      next[index] = value;
      return { ...prev, [field]: next };
    });
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(jsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const loadTemplate = (template: SavedTemplate) => {
    const parsed = typeof template.config === 'string' ? JSON.parse(template.config) : template.config;
    applyParsedConfig(parsed as Record<string, unknown>);
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateMessage('');
  };

  const openSavePrompt = () => {
    if (jsonError) return;
    const selected = templates.find((t) => t.id === editingTemplateId);
    setTemplateName(selected?.name || config.name || '');
    setShowSavePrompt(true);
    setTemplateMessage('');
  };

  const saveTemplate = async () => {
    const name = templateName.trim();
    if (!name) {
      setTemplateMessage('Enter a template name.');
      return;
    }
    if (jsonError) {
      setTemplateMessage('Fix JSON before saving.');
      return;
    }
    setSavingTemplate(true);
    setTemplateMessage('');
    try {
      const method = editingTemplateId ? 'PATCH' : 'POST';
      const url = editingTemplateId ? `/api/templates/${editingTemplateId}` : '/api/templates';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, config: payloadFromConfig(config) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save template');
      if (data.id) setEditingTemplateId(data.id);
      setShowSavePrompt(false);
      setTemplateMessage(editingTemplateId && method === 'PATCH' ? 'Template updated.' : 'Template saved.');
      await fetchTemplates();
    } catch (err) {
      setTemplateMessage(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">New AI discoverability audit</h1>
        </div>
        <div className="flex flex-col gap-2 min-w-[240px]">
          <Label htmlFor="template-select" className="text-[10px] uppercase font-bold text-muted-foreground">
            Template
          </Label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <select
                id="template-select"
                className="w-full h-11 pl-4 pr-10 rounded-xl border border-border bg-input text-sm appearance-none"
                value={editingTemplateId || ''}
                onChange={(e) => {
                  const template = templates.find((t) => t.id === e.target.value);
                  if (template) loadTemplate(template);
                }}
              >
                <option value="" disabled>
                  Select a template…
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
            {editingTemplateId && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingTemplateId(null);
                  setTemplateName('');
                  setTemplateMessage('');
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-6">
          <Card>
            <CardHeader className="bg-primary/5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                  <Globe className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle>Core parameters</CardTitle>
                  <CardDescription>Where to start, how deep, and how fast.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Audit name</Label>
                  <Input
                    id="name"
                    value={config.name}
                    onChange={(e) => setConfig({ ...config, name: e.target.value })}
                    placeholder="e.g. Novartis homepage GEO"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="url">Start URL</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn('h-6 px-2 text-[10px] gap-1', showAuth && 'text-primary bg-primary/10')}
                      onClick={() => setShowAuth((v) => !v)}
                    >
                      <Key className="h-3 w-3" />
                      Basic Auth
                    </Button>
                  </div>
                  <Input
                    id="url"
                    type="url"
                    value={config.startUrl}
                    onChange={(e) => setConfig({ ...config, startUrl: e.target.value })}
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {startPathLabel(config.startUrl) === '/'
                      ? 'Path is /. Page crawl covers this host (external hosts still skipped).'
                      : `Page crawl stays under ${startPathLabel(config.startUrl)}. Same-host URLs outside that prefix are ignored.`}{' '}
                    Site probes still check robots.txt, sitemap, and llms.txt at the host root.
                  </p>
                </div>
              </div>

              {showAuth && (
                <div className="p-4 rounded-lg border border-dashed border-primary/30 bg-primary/5 grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="user" className="text-xs uppercase text-muted-foreground">
                      Username
                    </Label>
                    <Input
                      id="user"
                      value={config.auth?.username || ''}
                      onChange={(e) =>
                        setConfig({ ...config, auth: { ...config.auth, username: e.target.value } })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pass" className="text-xs uppercase text-muted-foreground">
                      Password
                    </Label>
                    <Input
                      id="pass"
                      type="password"
                      value={config.auth?.password || ''}
                      onChange={(e) =>
                        setConfig({ ...config, auth: { ...config.auth, password: e.target.value } })
                      }
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="depth">Max depth</Label>
                    {config.maxDepth === 0 && (
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        Unlimited
                      </span>
                    )}
                  </div>
                  <Input
                    id="depth"
                    type="number"
                    min={0}
                    max={20}
                    value={config.maxDepth}
                    onChange={(e) => setConfig({ ...config, maxDepth: parseInt(e.target.value, 10) || 0 })}
                  />
                  <p className="text-[11px] text-muted-foreground">0 means unlimited hop depth.</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="maxPages">Max pages</Label>
                    {(!config.maxPages || config.maxPages <= 0) && (
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        Unlimited
                      </span>
                    )}
                  </div>
                  <Input
                    id="maxPages"
                    type="number"
                    min={0}
                    max={1000000}
                    value={config.maxPages || 0}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      setConfig({ ...config, maxPages: raw === '' ? 0 : parseInt(raw, 10) || 0 });
                    }}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    0 or empty means no page cap. Crawl stays in the start URL path.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rate">Rate limit (req/min)</Label>
                  <Input
                    id="rate"
                    type="number"
                    min={1}
                    value={config.rateLimit}
                    onChange={(e) => setConfig({ ...config, rateLimit: parseInt(e.target.value, 10) || 60 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ToggleCard
                  active
                  locked
                  title="Skip external"
                  on="Locked for GEO. Other hosts are never fetched, stored, or scored."
                />
                <ToggleCard
                  active={config.excludeSubdomains}
                  title="Exclude subdomains"
                  on={
                    config.excludeSubdomains
                      ? 'blog.example.com is treated as external.'
                      : 'Crawl subdomains as internal pages.'
                  }
                  onClick={() => setConfig((prev) => ({ ...prev, excludeSubdomains: !prev.excludeSubdomains }))}
                />
                <ToggleCard
                  active
                  locked
                  title="Stay in start path"
                  on={
                    startPathLabel(config.startUrl) === '/'
                      ? 'Locked for GEO. Start path is /, so the host is the page-crawl boundary (same as skip external).'
                      : `Locked for GEO. Only URLs under ${startPathLabel(config.startUrl)} are crawled. Same-host /news is out of scope.`
                  }
                />
                <ToggleCard
                  active={config.saveSkippedLinks}
                  title="Record skipped"
                  on={
                    config.saveSkippedLinks
                      ? 'Excluded URLs appear in the audit with a reason.'
                      : 'Excluded URLs are dropped from the page list.'
                  }
                  onClick={() => setConfig((prev) => ({ ...prev, saveSkippedLinks: !prev.saveSkippedLinks }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="bg-primary/5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                  <Shield className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle>Identity</CardTitle>
                  <CardDescription>User-Agent and request delay passed to crawler-core fetch.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ua">Browser agent</Label>
                  <div className="relative">
                    <select
                      id="ua"
                      className="w-full h-10 pl-3 pr-10 rounded-xl border border-border bg-input text-sm appearance-none"
                      value={config.userAgent}
                      onChange={(e) => setConfig({ ...config, userAgent: e.target.value })}
                    >
                      {USER_AGENTS.map((agent) => (
                        <option key={agent.name} value={agent.value}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customUa">Custom User-Agent (overrides selection)</Label>
                  <Input
                    id="customUa"
                    placeholder="Mozilla/5.0..."
                    value={config.customUserAgent}
                    onChange={(e) => setConfig({ ...config, customUserAgent: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="delay">Random delay (ms)</Label>
                  <span className="text-[11px] font-mono text-primary">{config.randomDelay}ms</span>
                </div>
                <Input
                  id="delay"
                  type="number"
                  min={0}
                  step={100}
                  value={config.randomDelay}
                  onChange={(e) => setConfig({ ...config, randomDelay: parseInt(e.target.value, 10) || 0 })}
                />
                <p className="text-[11px] text-muted-foreground">
                  Random wait from 0 to this value before each request, plus the rate-limit gap.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="bg-primary/5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                  <Filter className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle>Exclusions</CardTitle>
                  <CardDescription>Regex, wildcards, and CSS selectors crawler-core honors.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="excludeRegex">Exclusion regex</Label>
                <Input
                  id="excludeRegex"
                  className="font-mono text-xs"
                  placeholder="novartis\.com/careers"
                  value={config.excludeRegex}
                  onChange={(e) => setConfig({ ...config, excludeRegex: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">
                  Single pattern applied to every URL (legacy <code>excludeRegex</code>).
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <DynamicList
                  title="Regex exclusion rules"
                  items={config.regexRules || []}
                  placeholder="novartis\.com/[a-z]{2}-[a-z]{2}(/|$)"
                  onAdd={(val) => addListItem('regexRules', val)}
                  onRemove={(idx) => removeListItem('regexRules', idx)}
                  onUpdate={(idx, val) => updateListItem('regexRules', idx, val)}
                />
                <div className="space-y-6">
                  <DynamicList
                    title="CSS selectors to skip"
                    items={config.skipSelectors || []}
                    placeholder="e.g. .site-footer"
                    onAdd={(val) => addListItem('skipSelectors', val)}
                    onRemove={(idx) => removeListItem('skipSelectors', idx)}
                    onUpdate={(idx, val) => updateListItem('skipSelectors', idx, val)}
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {COMMON_SELECTORS.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => {
                            if (!config.skipSelectors?.includes(s.value)) addListItem('skipSelectors', s.value);
                          }}
                          className="px-2 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 text-[10px] font-bold text-primary border border-primary/20"
                        >
                          + {s.label}
                        </button>
                      ))}
                    </div>
                  </DynamicList>
                  <DynamicList
                    title="Wildcard exclusions"
                    items={config.wildcardExclusions || []}
                    placeholder="novartis.com/careers/*"
                    onAdd={(val) => addListItem('wildcardExclusions', val)}
                    onRemove={(idx) => removeListItem('wildcardExclusions', idx)}
                    onUpdate={(idx, val) => updateListItem('wildcardExclusions', idx, val)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-24">
          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between space-y-0 bg-primary/5 border-b border-border py-3">
              <div className="flex items-center gap-2">
                <Code className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm uppercase tracking-wider">JSON config</CardTitle>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={copyJson}>
                {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Textarea
                aria-label="Scan config JSON"
                className="font-mono min-h-[420px] rounded-none border-0 bg-transparent text-primary/90 text-[11px] leading-relaxed p-5 focus-visible:ring-0"
                value={jsonText}
                onChange={(e) => handleJsonChange(e.target.value)}
                spellCheck={false}
              />
              {jsonError && <p className="text-xs text-destructive px-5 pb-4">{jsonError}</p>}
            </CardContent>
          </Card>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {templateMessage && !showSavePrompt && (
            <p className="text-sm text-primary">{templateMessage}</p>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full h-12"
            disabled={savingTemplate || !!jsonError}
            onClick={openSavePrompt}
          >
            <Save className="h-4 w-4" />
            {editingTemplateId ? 'Update template' : 'Save as template'}
          </Button>
          <Button
            type="submit"
            className="w-full h-14 text-base font-bold tracking-wide"
            disabled={loading || !!jsonError || !config.startUrl}
          >
            {loading ? (
              'Starting…'
            ) : (
              <span className="flex items-center gap-2">
                <Play className="h-5 w-5 fill-current" />
                Start audit
              </span>
            )}
          </Button>
          <p className="text-[11px] text-center text-muted-foreground">
            Extra keys in the JSON object are stored and passed through to crawler-core.
          </p>
        </div>
      </form>

      {showSavePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-primary">
                <div className="p-2 bg-primary/10 rounded-full">
                  <LayoutTemplate className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground">
                  {editingTemplateId ? 'Update template' : 'Save as template'}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Name this crawler config. It is stored in your Lynx GEO database and can be applied on the next audit.
              </p>
              <div className="space-y-2">
                <Label htmlFor="template-name">Template name</Label>
                <Input
                  id="template-name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveTemplate();
                    }
                  }}
                  placeholder="e.g. Novartis crawler preset"
                  autoFocus
                />
              </div>
              {templateMessage && <p className="text-sm text-destructive">{templateMessage}</p>}
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (!savingTemplate) {
                      setShowSavePrompt(false);
                      setTemplateMessage('');
                    }
                  }}
                  disabled={savingTemplate}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={saveTemplate} disabled={savingTemplate}>
                  {savingTemplate ? 'Saving…' : editingTemplateId ? 'Update' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleCard({
  active,
  title,
  on,
  onClick,
  locked,
}: {
  active: boolean;
  title: string;
  on: string;
  onClick?: () => void;
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      disabled={locked}
      className={cn(
        'text-left p-4 rounded-xl border transition-colors',
        active ? 'bg-primary/10 border-primary/40' : 'bg-muted/30 border-border hover:border-primary/30',
        locked && 'cursor-not-allowed',
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={cn('w-2 h-2 rounded-full', active ? 'bg-primary' : 'bg-muted-foreground/30')} />
        <span className={cn('text-[11px] font-bold uppercase tracking-wider', active ? 'text-primary' : 'text-muted-foreground')}>
          {title}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{on}</p>
    </button>
  );
}

function DynamicList({
  title,
  items,
  onAdd,
  onRemove,
  onUpdate,
  placeholder,
  children,
}: {
  title: string;
  items: string[];
  onAdd: (val: string) => void;
  onRemove: (idx: number) => void;
  onUpdate: (idx: number, val: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
}) {
  const [input, setInput] = useState('');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{title}</Label>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-primary"
          onClick={() => {
            onAdd(input);
            setInput('');
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {children}
      <Input
        placeholder={placeholder}
        value={input}
        className="h-8 text-xs"
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onAdd(input);
            setInput('');
          }
        }}
      />
      <div className="space-y-1">
        {items.map((item, idx) => (
          <div key={`${title}-${idx}`} className="flex items-center gap-2 bg-muted/40 rounded px-2 py-1 group">
            <input
              className="text-[11px] font-mono bg-transparent border-none outline-none w-full"
              value={item}
              onChange={(e) => onUpdate(idx, e.target.value)}
            />
            <button type="button" onClick={() => onRemove(idx)} className="text-muted-foreground hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
