'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Play, Save, Copy, Check, Trash2, LayoutTemplate, Plus, X, Shield, Filter, Globe, Code, ChevronDown, Key } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface ScanConfig {
  name: string;
  startUrl: string;
  maxDepth: number;
  rateLimit: number;
  excludeRegex: string;
  auth?: {
    username?: string;
    password?: string;
  };
  regexRules?: string[];
  skipSelectors?: string[];
  wildcardExclusions?: string[];
  isTargeted?: boolean;
  targetUrls?: string[];
  skipExternal?: boolean;
  excludeSubdomains?: boolean;
  doNotTraverseBackward?: boolean;
}

const DEFAULT_CONFIG: ScanConfig = {
  name: 'My New Scan',
  startUrl: 'https://example.com',
  maxDepth: 2,
  rateLimit: 60,
  excludeRegex: '',
  auth: { username: '', password: '' },
  regexRules: [],
  skipSelectors: [],
  wildcardExclusions: [],
  isTargeted: false,
  targetUrls: [],
  skipExternal: false,
  excludeSubdomains: false,
  doNotTraverseBackward: false,
};

const COMMON_SELECTORS = [
  { label: 'Header', value: 'header' },
  { label: 'Footer', value: 'footer' },
  { label: 'Nav', value: 'nav' },
  { label: 'Sidebar', value: 'aside' },
  { label: 'Ads', value: '.ads, .advertisement' },
  { label: 'Social', value: '.social-links' },
];

export default function NewScanPage() {
  const router = useRouter();
  const [config, setConfig] = useState<ScanConfig>(DEFAULT_CONFIG);
  const [jsonText, setJsonText] = useState(JSON.stringify(config, null, 2));
  const [jsonError, setJsonError] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [targetUrlsRaw, setTargetUrlsRaw] = useState('');

  // Ref to track if the change is coming from the JSON editor to avoid circular updates that lose cursor focus
  const isUpdatingFromJson = useRef(false);

  useEffect(() => {
    fetchTemplates();
    
    // Check for edit param in URL
    const searchParams = new URLSearchParams(window.location.search);
    const editId = searchParams.get('edit');
    
    // Check for selected template from Templates page or edit param
    const checkTemplates = async () => {
        const savedConfig = localStorage.getItem('selected_template_config');
        const targetParam = searchParams.get('target');
        
        if (targetParam === 'true') {
            setConfig(prev => ({ ...prev, isTargeted: true }));
        }

        if (savedConfig) {
          try {
            const parsed = JSON.parse(savedConfig);
            // Ensure all fields exist
            const merged = { ...config, ...parsed };
            setConfig(merged);
            setJsonText(JSON.stringify(merged, null, 2));
            if (merged.targetUrls) setTargetUrlsRaw(merged.targetUrls.join('\n'));
            localStorage.removeItem('selected_template_config');
            
            // If the saved config came with an ID (for editing)
            if (parsed.id) setEditingTemplateId(parsed.id);
          } catch (err) {
            console.error('Failed to parse saved template config', err);
          }
        } else if (editId) {
            // Fetch the specific template if we have an ID
            try {
                const res = await fetch('/api/templates');
                if (res.ok) {
                    const data = await res.json();
                    const template = data.find((t: any) => t.id === editId);
                    if (template) {
                        const parsed = typeof template.config === 'string' ? JSON.parse(template.config) : template.config;
                        const merged = { ...config, ...parsed };
                        setConfig(merged);
                        setJsonText(JSON.stringify(merged, null, 2));
                        if (merged.targetUrls) setTargetUrlsRaw(merged.targetUrls.join('\n'));
                        setEditingTemplateId(editId);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch template for editing', err);
            }
        }
    };
    
    checkTemplates();
  }, []);

  const fetchTemplates = async () => {
    const res = await fetch('/api/templates');
    if (res.ok) {
      const data = await res.json();
      setTemplates(data);
    }
  };

  // Sync UI to JSON - only if not currently typing in JSON editor
  useEffect(() => {
    if (!isUpdatingFromJson.current) {
      setJsonText(JSON.stringify(config, null, 2));
      setJsonError('');
    }
    isUpdatingFromJson.current = false;
  }, [config]);

  // Sync JSON to UI
  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setJsonText(val);
    isUpdatingFromJson.current = true;
    try {
      const parsed = JSON.parse(val);
      // BUG FIX: Replace config entirely instead of merging to allow field deletions
      // We still use the default config if the parsed object is missing core fields
      const newConfig = { ...DEFAULT_CONFIG, ...parsed };
      setConfig(newConfig);
      
      // Update targetUrlsRaw if it changed in JSON
      if (parsed.targetUrls && Array.isArray(parsed.targetUrls)) {
        setTargetUrlsRaw(parsed.targetUrls.join('\n'));
      } else if (parsed.targetUrls === undefined) {
        setTargetUrlsRaw('');
      }
      
      setJsonError('');
    } catch (err) {
      setJsonError('Invalid JSON format');
    }
  };

  const handleStart = async () => {
    // Validation
    if (config.isTargeted && (!config.targetUrls || config.targetUrls.length === 0)) {
        alert("Please enter target URLs for the targeted audit.");
        return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...config,
            isTargeted: !!config.isTargeted // Force boolean
        }),
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

  const handleSaveTemplate = async () => {
    setSavingTemplate(true);
    try {
      const method = editingTemplateId ? 'PATCH' : 'POST';
      const url = editingTemplateId ? `/api/templates/${editingTemplateId}` : '/api/templates';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: config.name, config }),
      });
      if (res.ok) {
        fetchTemplates();
        if (editingTemplateId) {
            // Optional: Show success toast or reset editing state
            alert('Template updated successfully');
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingTemplate(false);
    }
  };

  const loadTemplate = (template: any) => {
    const parsedConfig = typeof template.config === 'string' ? JSON.parse(template.config) : template.config;
    const merged = { ...config, ...parsedConfig };
    setConfig(merged);
    setJsonText(JSON.stringify(merged, null, 2));
    setEditingTemplateId(template.id);
    if (merged.targetUrls) {
      setTargetUrlsRaw(merged.targetUrls.join('\n'));
    } else {
      setTargetUrlsRaw('');
    }
  };

  const deleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchTemplates();
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(jsonText);
    setShowCopyFeedback(true);
    setTimeout(() => setShowCopyFeedback(false), 2000);
  };

  const handleAuthChange = (field: string, value: string) => {
    setConfig(prev => ({
        ...prev,
        auth: { ...prev.auth, [field]: value }
    }));
  };

  const addListItem = (field: keyof ScanConfig, value: string) => {
    if (!value) return;
    setConfig(prev => ({
        ...prev,
        [field]: [...(prev[field] as string[] || []), value]
    }));
  };

  const removeListItem = (field: keyof ScanConfig, index: number) => {
    setConfig(prev => ({
        ...prev,
        [field]: (prev[field] as string[]).filter((_, i) => i !== index)
    }));
  };

  const updateListItem = (field: keyof ScanConfig, index: number, value: string) => {
    setConfig(prev => {
        const newList = [...(prev[field] as string[] || [])];
        newList[index] = value;
        return {
            ...prev,
            [field]: newList
        };
    });
  };

  return (
    <div className="p-8 space-y-8 max-w-4xl mx-auto">
      {/* Header with Preset Dropdown */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-4"
      >
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Initialize Scan</h1>
            <p className="text-muted-foreground mt-1">Configure your crawling parameters or select a preset.</p>
        </div>
        
        <div className="flex flex-col gap-2">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Preset</Label>
            <div className="flex items-center gap-3">
                <div 
                    className={cn(
                        "flex items-center gap-2 px-3 h-10 border rounded-lg cursor-pointer transition-all",
                        config.isTargeted ? "bg-primary/10 border-primary text-primary" : "bg-background border-input hover:bg-muted"
                    )}
                    onClick={() => setConfig(prev => ({ ...prev, isTargeted: !prev.isTargeted }))}
                >
                    <div className={cn("w-3 h-3 rounded-full transition-all", config.isTargeted ? "bg-primary" : "bg-muted-foreground/30")} />
                    <span className="text-xs font-semibold">Targeted Audit</span>
                </div>

                <div className="relative group min-w-[200px]">
                    <select 
                        className="w-full h-10 pl-3 pr-10 bg-background border rounded-lg appearance-none cursor-pointer focus:ring-2 ring-primary/20 transition-all outline-none text-sm"
                        onChange={(e) => {
                            const template = templates.find(t => t.id === e.target.value);
                            if (template) loadTemplate(template);
                        }}
                        value={editingTemplateId || ""}
                    >
                        <option value="" disabled>Select a template...</option>
                        {templates
                            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                            .slice(0, 10)
                            .map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))
                        }
                    </select>
                    <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none group-hover:text-foreground transition-colors" />
                </div>
            </div>
        </div>
      </motion.div>

      <div className="space-y-6">
        <div className="animated-border-container shadow-2xl">
            <div className="animated-border-gradient" />
            <Card className="animated-border-inner">
                <CardHeader className="bg-muted/10 pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <Globe className="h-4 w-4" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">Core Parameters</CardTitle>
                            <CardDescription>Essential details to start your scan.</CardDescription>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button 
                            variant="glow" 
                            size="sm" 
                            onClick={handleSaveTemplate}
                            disabled={savingTemplate}
                            className="text-xs px-4"
                        >
                            <Save className="mr-2 h-3.5 w-3.5" />
                            {savingTemplate ? 'Saving...' : editingTemplateId ? 'Update Preset' : 'Save as Preset'}
                        </Button>
                        {editingTemplateId && (
                            <Button variant="ghost" size="sm" onClick={() => setEditingTemplateId(null)}>
                                <Plus className="mr-2 h-4 w-4" /> New
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 md:col-span-1">
                        <Label>Scan Name</Label>
                        <Input
                            placeholder="e.g. Weekly Health Check"
                            value={config.name}
                            onChange={(e) => setConfig({ ...config, name: e.target.value })}
                            className="bg-muted/30 border-none shadow-none focus-visible:ring-1"
                        />
                    </div>
                    
                    <div className="space-y-2 md:col-span-1">
                        <div className="flex items-center justify-between">
                            <Label>Starting URL</Label>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className={cn("h-6 px-1.5 text-[10px] gap-1.5", showAuth ? "text-primary bg-primary/10" : "text-muted-foreground")}
                                onClick={() => setShowAuth(!showAuth)}
                            >
                                <Key className="h-3 w-3" /> AUTH
                            </Button>
                        </div>
                        <Input
                            type="url"
                            placeholder="https://mysite.com"
                            value={config.startUrl}
                            onChange={(e) => setConfig({ ...config, startUrl: e.target.value })}
                            className="bg-muted/30 border-none shadow-none focus-visible:ring-1"
                        />
                    </div>
                </div>

                <AnimatePresence>
                    {showAuth && (
                        <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="p-4 bg-muted/30 rounded-lg border border-dashed border-primary/20 grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Username</Label>
                                    <Input 
                                        placeholder="user" 
                                        value={config.auth?.username || ''} 
                                        onChange={(e) => handleAuthChange('username', e.target.value)}
                                        className="h-8 text-xs"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Password</Label>
                                    <Input 
                                        type="password" 
                                        placeholder="••••••" 
                                        value={config.auth?.password || ''} 
                                        onChange={(e) => handleAuthChange('password', e.target.value)}
                                        className="h-8 text-xs"
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label>Max Depth (0=∞</Label>
                        <Input
                            type="number"
                            min={0}
                            value={config.maxDepth}
                            onChange={(e) => setConfig({ ...config, maxDepth: parseInt(e.target.value) || 0 })}
                            className="bg-muted/30 border-none shadow-none focus-visible:ring-1"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Rate Limit (req/min)</Label>
                        <Input
                            type="number"
                            min={1}
                            value={config.rateLimit}
                            onChange={(e) => setConfig({ ...config, rateLimit: parseInt(e.target.value) || 60 })}
                            className="bg-muted/30 border-none shadow-none focus-visible:ring-1"
                        />
                    </div>
                </div>

                <div className="flex flex-wrap gap-4 pt-2">
                    <div 
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 border rounded-lg cursor-pointer transition-all",
                            config.skipExternal ? "bg-blue-500/10 border-blue-500 text-blue-500" : "bg-background border-input hover:bg-muted"
                        )}
                        onClick={() => setConfig(prev => ({ ...prev, skipExternal: !prev.skipExternal }))}
                    >
                        <div className={cn("w-2 h-2 rounded-full transition-all", config.skipExternal ? "bg-blue-500" : "bg-muted-foreground/30")} />
                        <span className="text-[10px] font-bold uppercase">Skip External Links</span>
                    </div>

                    <div 
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 border rounded-lg cursor-pointer transition-all",
                            config.excludeSubdomains ? "bg-orange-500/10 border-orange-500 text-orange-500" : "bg-background border-input hover:bg-muted"
                        )}
                        onClick={() => setConfig(prev => ({ ...prev, excludeSubdomains: !prev.excludeSubdomains }))}
                    >
                        <div className={cn("w-2 h-2 rounded-full transition-all", config.excludeSubdomains ? "bg-orange-500" : "bg-muted-foreground/30")} />
                        <span className="text-[10px] font-bold uppercase">Exclude Subdomains</span>
                    </div>

                    <div 
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 border rounded-lg cursor-pointer transition-all",
                            config.doNotTraverseBackward ? "bg-purple-500/10 border-purple-500 text-purple-500" : "bg-background border-input hover:bg-muted"
                        )}
                        onClick={() => setConfig(prev => ({ ...prev, doNotTraverseBackward: !prev.doNotTraverseBackward }))}
                    >
                        <div className={cn("w-2 h-2 rounded-full transition-all", config.doNotTraverseBackward ? "bg-purple-500" : "bg-muted-foreground/30")} />
                        <span className="text-[10px] font-bold uppercase">Stay in Subpath (No Back)</span>
                    </div>
                </div>

                <AnimatePresence>
                    {config.isTargeted && (
                        <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden space-y-2"
                        >
                            <Label className="text-primary font-bold">Target URLs to Audit (Bulk Entry)</Label>
                            <Textarea 
                                placeholder="Paste URLs here, one per line. e.g.
https://mysite.com/report1.pdf
https://mysite.com/images/logo.png"
                                value={targetUrlsRaw}
                                onChange={(e) => {
                                    const raw = e.target.value;
                                    setTargetUrlsRaw(raw);
                                    const urls = raw.split('\n').map(s => s.trim()).filter(s => !!s);
                                    setConfig({ ...config, targetUrls: urls });
                                }}
                                className="min-h-[120px] bg-primary/5 border-primary/20 font-mono text-xs focus-visible:ring-1"
                            />
                            <p className="text-[10px] text-muted-foreground italic">Note: The scan results will be focused exclusively on these target URLs.</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </CardContent>
        </Card>
      </div>

        {/* Advanced Filters Toggle */}
        <div className="space-y-4">
            <Button 
                variant="ghost" 
                className="w-full justify-between h-12 px-6 rounded-xl hover:bg-muted/50 border border-transparent hover:border-muted-foreground/20 transition-all text-muted-foreground"
                onClick={() => setShowAdvanced(!showAdvanced)}
            >
                <div className="flex items-center gap-3">
                    <Filter className="h-4 w-4" />
                    <span className="font-semibold text-sm">Advanced Exclusion Logic</span>
                </div>
                <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")} />
            </Button>

            <AnimatePresence>
                {showAdvanced && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <Card className="border-none shadow-lg bg-card/50">
                            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Legacy Exclude Pattern (Regex)</Label>
                                        <Input
                                            placeholder="\.pdf$|\.zip$"
                                            value={config.excludeRegex}
                                            onChange={(e) => setConfig({ ...config, excludeRegex: e.target.value })}
                                            className="bg-muted/50 border-none shadow-none focus-visible:ring-1 h-9 text-xs"
                                        />
                                    </div>
                                    <DynamicList 
                                        title="Regex Filter rules" 
                                        items={config.regexRules || []} 
                                        onAdd={(val) => addListItem('regexRules', val)} 
                                        onRemove={(idx) => removeListItem('regexRules', idx)}
                                        onUpdate={(idx, val) => updateListItem('regexRules', idx, val)}
                                        placeholder="novartis\.com/node.*"
                                    />
                                </div>
                                <div className="space-y-6">
                                    <DynamicList 
                                        title="CSS Selectors to skip" 
                                        items={config.skipSelectors || []} 
                                        onAdd={(val) => addListItem('skipSelectors', val)} 
                                        onRemove={(idx) => removeListItem('skipSelectors', idx)}
                                        onUpdate={(idx, val) => updateListItem('skipSelectors', idx, val)}
                                        placeholder="e.g. .site-footer"
                                    >
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {COMMON_SELECTORS.map(s => (
                                                <button
                                                    key={s.value}
                                                    type="button"
                                                    onClick={() => {
                                                        if (!config.skipSelectors?.includes(s.value)) {
                                                            addListItem('skipSelectors', s.value);
                                                        }
                                                    }}
                                                    className="px-2 py-0.5 rounded-full bg-primary/5 hover:bg-primary/10 text-[9px] font-bold text-primary border border-primary/20 transition-colors"
                                                >
                                                    + {s.label}
                                                </button>
                                            ))}
                                        </div>
                                    </DynamicList>
                                    <DynamicList 
                                        title="Wildcard Exclusions" 
                                        items={config.wildcardExclusions || []} 
                                        onAdd={(val) => addListItem('wildcardExclusions', val)} 
                                        onRemove={(idx) => removeListItem('wildcardExclusions', idx)}
                                        onUpdate={(idx, val) => updateListItem('wildcardExclusions', idx, val)}
                                        placeholder="novartis.com/careers/*"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {/* Code Engine Toggle */}
        <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setShowCode(!showCode)}
                    className="text-xs text-muted-foreground hover:text-foreground gap-2"
                >
                    <Code className="h-3 w-3" /> {showCode ? 'Hide Code Engine' : 'Reveal Code Engine'}
                </Button>
                <AnimatePresence>
                    {showCode && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <Button variant="ghost" size="sm" onClick={copyToClipboard} className="h-7 w-7 p-0">
                                <AnimatePresence mode="wait">
                                    {showCopyFeedback ? (
                                        <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                                            <Check className="h-3 w-3 text-green-500" />
                                        </motion.div>
                                    ) : (
                                        <motion.div key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                                            <Copy className="h-3 w-3" />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <AnimatePresence>
                {showCode && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <Card className="bg-slate-950 border-none shadow-inner overflow-hidden">
                            <CardContent className="p-0">
                                <Textarea
                                    className="font-mono h-[200px] bg-transparent text-slate-300 text-[10px] resize-none border-0 focus-visible:ring-0 ring-offset-0 p-4"
                                    value={jsonText}
                                    onChange={handleJsonChange}
                                />
                                {jsonError && (
                                    <div className="px-4 pb-4">
                                        <p className="text-[10px] text-red-500 font-medium">⚠ {jsonError}</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {/* Ignite Button */}
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="pt-4"
        >
            <Button 
                onClick={handleStart} 
                disabled={loading || !!jsonError || !config.startUrl} 
                variant="glow"
                className="w-full h-16 text-xl rounded-2xl font-black tracking-widest uppercase hover:scale-[1.02] active:scale-[0.98]"
            >
                {loading ? (
                    <span className="flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Powering up Engine...
                    </span>
                ) : (
                    <span className="flex items-center gap-2">
                        <Play className="h-5 w-5 fill-current" /> Ignite Scan
                    </span>
                )}
            </Button>
        </motion.div>
      </div>
    </div>
  );
}

function DynamicList({ 
    title, 
    items, 
    onAdd, 
    onRemove, 
    onUpdate,
    placeholder,
    children
}: { 
    title: string, 
    items: string[], 
    onAdd: (val: string) => void, 
    onRemove: (idx: number) => void, 
    onUpdate: (idx: number, val: string) => void,
    placeholder?: string,
    children?: React.ReactNode
}) {
    const [input, setInput] = useState('');

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{title}</Label>
                <div className="flex flex-col items-end">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-5 w-5 text-blue-500" 
                        onClick={() => {
                            onAdd(input);
                            setInput('');
                        }}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            {children}
            <div className="space-y-2">
                <div className="flex gap-2">
                    <Input 
                        placeholder={placeholder} 
                        value={input} 
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                onAdd(input);
                                setInput('');
                            }
                        }}
                        className="h-8 text-xs bg-muted/50 border-none shadow-none focus-visible:ring-1"
                    />
                </div>
                <div className="space-y-1">
                    {items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-accent/10 border border-muted-foreground/10 rounded px-2 py-1 group animate-in fade-in slide-in-from-left-2">
                            <input 
                                className="text-[11px] font-mono bg-transparent border-none outline-none focus:ring-0 w-full mr-2"
                                value={item}
                                onChange={(e) => onUpdate(idx, e.target.value)}
                            />
                            <button 
                                onClick={() => onRemove(idx)}
                                className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
