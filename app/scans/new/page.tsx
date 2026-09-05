'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Play, Save, Copy, Check, Trash2, LayoutTemplate, Plus, X, Shield, Filter, Globe, Code, ChevronDown, Key, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { USER_AGENTS, DEFAULT_USER_AGENT } from '@/lib/crawler/agents';


interface ScanConfig {
  name: string;
  startUrl: string;
  maxDepth: number;
  rateLimit: number;
  excludeRegex: string;
  userAgent: string;
  customUserAgent: string;
  randomDelay: number;
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
  saveSkippedLinks?: boolean;
}


const DEFAULT_CONFIG: ScanConfig = {
  name: 'My New Audit',
  startUrl: 'https://example.com',
  maxDepth: 2,
  rateLimit: 60,
  excludeRegex: '',
  userAgent: DEFAULT_USER_AGENT,
  customUserAgent: '',
  randomDelay: 500,
  auth: { username: '', password: '' },
  regexRules: [],
  skipSelectors: [],
  wildcardExclusions: [],
  isTargeted: false,
  targetUrls: [],
  skipExternal: false,
  excludeSubdomains: false,
  doNotTraverseBackward: false,
  saveSkippedLinks: false,
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
  const searchParams = useSearchParams();
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
    const [startError, setStartError] = useState('');
    const [isValidatingAuth, setIsValidatingAuth] = useState(false);
    const [authValidation, setAuthValidation] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  // React to query parameter changes (for navigating between normal and targeted scan)
  useEffect(() => {
    const targetParam = searchParams.get('target');
    if (targetParam === 'true') {
        setConfig(prev => ({ ...prev, isTargeted: true }));
    } else {
        setConfig(prev => ({ ...prev, isTargeted: false }));
    }
  }, [searchParams]);

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
        setStartError('');

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

            const payload = await res.json().catch(() => ({}));

            if (res.status === 401) {
                setStartError('Your session expired. Please sign in again.');
                router.push('/login');
                return;
            }

            if (!res.ok) {
                throw new Error(payload.error || 'Failed to start scan');
            }

            router.push(`/scans/${payload.id}`);
    } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to start scan';
            console.error(err);
            setStartError(message);
    } finally {
      setLoading(false);
    }
  };

    const validateCredentials = async () => {
        if (!config.startUrl) {
            setAuthValidation({ type: 'error', message: 'Enter a starting URL first.' });
            return;
        }

        const username = config.auth?.username?.trim() || '';
        const password = config.auth?.password?.trim() || '';
        if (!username || !password) {
            setAuthValidation({ type: 'error', message: 'Both username and password are required.' });
            return;
        }

        setIsValidatingAuth(true);
        setAuthValidation(null);

        try {
            const res = await fetch('/api/scans/validate-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    startUrl: config.startUrl,
                    auth: { username, password },
                }),
            });

            const payload = await res.json().catch(() => ({}));

            if (res.status === 401 && payload?.error === 'Unauthorized') {
                setAuthValidation({ type: 'error', message: 'Session expired. Please sign in again.' });
                router.push('/login');
                return;
            }

            if (!res.ok || payload.valid === false) {
                setAuthValidation({
                    type: 'error',
                    message: payload.message || payload.error || 'Credential validation failed.',
                });
                return;
            }

            setAuthValidation({
                type: 'success',
                message: payload.message || 'Credentials look valid for the starting URL.',
            });
        } catch (error) {
            console.error(error);
            setAuthValidation({ type: 'error', message: 'Network error while validating credentials.' });
        } finally {
            setIsValidatingAuth(false);
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
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      {/* Header with Preset Dropdown */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-4"
      >
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Initialize audit</h1>
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

                <div className="relative group min-w-[220px]">
                    <select 
                        className="w-full h-11 pl-4 pr-10 bg-input border border-border group-hover:border-primary/50 rounded-xl appearance-none cursor-pointer focus:ring-2 ring-primary/20 transition-all outline-none text-sm font-medium shadow-xl"
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Form Configuration */}
        <div className="lg:col-span-8 space-y-8">
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
                                <div className="mt-3 flex items-center justify-between gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={validateCredentials}
                                        disabled={isValidatingAuth}
                                        className="h-8"
                                    >
                                        {isValidatingAuth ? 'Validating...' : 'Validate Credentials'}
                                    </Button>
                                    {authValidation && (
                                        <div className={cn(
                                            'text-xs flex items-center gap-1.5',
                                            authValidation.type === 'success' ? 'text-emerald-400' : 'text-destructive'
                                        )}>
                                            {authValidation.type === 'success' ? (
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                            ) : (
                                                <AlertTriangle className="h-3.5 w-3.5" />
                                            )}
                                            <span>{authValidation.message}</span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Max Depth</Label>
                                {config.maxDepth === 0 && (
                                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full animate-pulse">
                                        ∞ UNLIMITED
                                    </span>
                                )}
                            </div>
                            <Input
                                type="number"
                                min={0}
                                value={config.maxDepth}
                                onChange={(e) => setConfig({ ...config, maxDepth: parseInt(e.target.value) || 0 })}
                            />
                            <p className="text-[10px] text-muted-foreground italic">Set to 0 for unlimited crawl.</p>
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <motion.div 
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            className={cn(
                                "relative overflow-hidden group p-4 border rounded-xl cursor-pointer transition-all duration-300",
                                config.skipExternal 
                                    ? "bg-blue-500/10 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.15)]" 
                                    : "bg-muted/30 border-border hover:border-border hover:bg-muted/50"
                            )}
                            onClick={() => setConfig(prev => ({ ...prev, skipExternal: !prev.skipExternal }))}
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <div className={cn(
                                    "w-2 h-2 rounded-full transition-all duration-500", 
                                    config.skipExternal ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" : "bg-muted-foreground/30"
                                )} />
                                <span className={cn(
                                    "text-[11px] font-black uppercase tracking-wider transition-colors",
                                    config.skipExternal ? "text-blue-400" : "text-muted-foreground"
                                )}>Skip External</span>
                            </div>
                            <p className="text-[10px] leading-relaxed text-muted-foreground group-hover:text-foreground/70 transition-colors">
                                {config.skipExternal 
                                    ? "External links (like Google) will be verified once for status but not crawled." 
                                    : "Crawl external sites found during the scan (Warning: can be very slow)."}
                            </p>
                        </motion.div>

                        <motion.div 
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            className={cn(
                                "relative overflow-hidden group p-4 border rounded-xl cursor-pointer transition-all duration-300",
                                config.excludeSubdomains 
                                    ? "bg-orange-500/10 border-orange-500/50 shadow-[0_0_20px_rgba(249,115,22,0.15)]" 
                                    : "bg-muted/30 border-border hover:border-border hover:bg-muted/50"
                            )}
                            onClick={() => setConfig(prev => ({ ...prev, excludeSubdomains: !prev.excludeSubdomains }))}
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <div className={cn(
                                    "w-2 h-2 rounded-full transition-all duration-500", 
                                    config.excludeSubdomains ? "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]" : "bg-muted-foreground/30"
                                )} />
                                <span className={cn(
                                    "text-[11px] font-black uppercase tracking-wider transition-colors",
                                    config.excludeSubdomains ? "text-orange-400" : "text-muted-foreground"
                                )}>Exclude Subdomains</span>
                            </div>
                            <p className="text-[10px] leading-relaxed text-muted-foreground group-hover:text-foreground/70 transition-colors">
                                {config.excludeSubdomains 
                                    ? "Skip subdomain URLs (like api.site.com or blog.site.com). Not fetched or crawled." 
                                    : "Crawl subdomains as if they were internal pages."}
                            </p>
                        </motion.div>

                        <motion.div 
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            className={cn(
                                "relative overflow-hidden group p-4 border rounded-xl cursor-pointer transition-all duration-300",
                                config.doNotTraverseBackward 
                                    ? "bg-purple-500/10 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.2)]" 
                                    : "bg-muted/30 border-border hover:border-border hover:bg-muted/50"
                            )}
                            onClick={() => setConfig(prev => ({ ...prev, doNotTraverseBackward: !prev.doNotTraverseBackward }))}
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <div className={cn(
                                    "w-2 h-2 rounded-full transition-all duration-500", 
                                    config.doNotTraverseBackward ? "bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]" : "bg-muted-foreground/30"
                                )} />
                                <span className={cn(
                                    "text-[11px] font-black uppercase tracking-wider transition-colors",
                                    config.doNotTraverseBackward ? "text-purple-400" : "text-muted-foreground"
                                )}>Stay in Subpath</span>
                            </div>
                            <p className="text-[10px] leading-relaxed text-muted-foreground group-hover:text-foreground/70 transition-colors">
                                {config.doNotTraverseBackward 
                                    ? "Only crawl deeper into the start URL path. Never go 'up' or 'sideways'." 
                                    : "Crawl the entire site starting from the root of the domain."}
                            </p>
                        </motion.div>

                        <motion.div 
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            className={cn(
                                "relative overflow-hidden group p-4 border rounded-xl cursor-pointer transition-all duration-300",
                                config.saveSkippedLinks 
                                    ? "bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.2)]" 
                                    : "bg-muted/30 border-border hover:border-border hover:bg-muted/50"
                            )}
                            onClick={() => setConfig(prev => ({ ...prev, saveSkippedLinks: !prev.saveSkippedLinks }))}
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <div className={cn(
                                    "w-2 h-2 rounded-full transition-all duration-500", 
                                    config.saveSkippedLinks ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-muted-foreground/30"
                                )} />
                                <span className={cn(
                                    "text-[11px] font-black uppercase tracking-wider transition-colors",
                                    config.saveSkippedLinks ? "text-emerald-400" : "text-muted-foreground"
                                )}>Record Skipped</span>
                            </div>
                            <p className="text-[10px] leading-relaxed text-muted-foreground group-hover:text-foreground/70 transition-colors">
                                {config.saveSkippedLinks 
                                    ? "Links excluded by rules will be recorded in the report with a reason." 
                                    : "Excluded links are ignored to save database space (Default)."}
                            </p>
                        </motion.div>
                    </div>


                    <div className="pt-6 border-t border-white/5 space-y-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Shield className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-bold uppercase tracking-widest text-primary">Anti-Bot & Identity</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-muted-foreground uppercase">Browser Agent</Label>
                                    <div className="relative group">
                                        <select 
                                            className="w-full h-10 pl-3 pr-10 bg-muted/30 border-none rounded-lg appearance-none cursor-pointer focus:ring-1 ring-primary/50 transition-all outline-none text-xs"
                                            value={config.userAgent}
                                            onChange={(e) => setConfig({ ...config, userAgent: e.target.value })}
                                        >
                                            {USER_AGENTS.map(agent => (
                                                <option key={agent.name} value={agent.value}>{agent.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none group-hover:text-foreground transition-colors" />
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-muted-foreground uppercase">Custom User Agent (Overrides selection)</Label>
                                    <Input
                                        placeholder="Mozilla/5.0..."
                                        value={config.customUserAgent}
                                        onChange={(e) => setConfig({ ...config, customUserAgent: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold text-muted-foreground uppercase">Random Delay (ms)</Label>
                                    <span className="text-[10px] font-mono text-primary">{config.randomDelay}ms</span>
                                </div>
                                <Input
                                    type="number"
                                    min={0}
                                    step={100}
                                    value={config.randomDelay}
                                    onChange={(e) => setConfig({ ...config, randomDelay: parseInt(e.target.value) || 0 })}
                                />
                                <p className="text-[10px] text-muted-foreground leading-relaxed italic mt-2">
                                    Adds a random delay between 0 and this value before each request to mimic human browsing and avoid bot detection.
                                </p>
                            </div>
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
                                <Label className="text-primary font-bold">Target URLs to Audit (Webpages, PDFs, Images)</Label>
                                <Textarea 
                                    placeholder="Paste URLs here, one per line. e.g.
https://mysite.com/landing-page
https://mysite.com/report-2024.pdf
https://mysite.com/assets/banner.png"
                                    value={targetUrlsRaw}
                                    onChange={(e) => {
                                        const raw = e.target.value;
                                        setTargetUrlsRaw(raw);
                                        const urls = raw.split('\n').map(s => s.trim()).filter(s => !!s);
                                        setConfig({ ...config, targetUrls: urls });
                                    }}
                                    className="min-h-[120px] bg-primary/5 border-primary/20 font-mono text-xs focus-visible:ring-1"
                                />
                                <p className="text-[10px] text-muted-foreground italic">
                                    Note: The scan will be focused exclusively on finding these target URLs. 
                                    <span className="text-primary/70 block mt-1 font-bold tracking-tight uppercase text-[9px]">
                                        Pro-Tip: Only targets linked directly from your "Starting URL" or other target pages will be discovered.
                                    </span>
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>
          </div>

          {/* Advanced Exclusion Logic: Now a permanent card */}
          <Card className="border-white/10 shadow-xl bg-card/50 overflow-hidden">
              <CardHeader className="bg-muted/20 pb-4 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
                      <Filter className="h-4 w-4" />
                  </div>
                  <div>
                      <CardTitle className="text-lg">Advanced Exclusion Logic</CardTitle>
                      <CardDescription>Fine-tune what links should be ignored during the scan.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                      <DynamicList 
                          title="Regex Exclusion Rules" 
                          items={config.regexRules || []} 
                          onAdd={(val) => addListItem('regexRules', val)} 
                          onRemove={(idx) => removeListItem('regexRules', idx)}
                          onUpdate={(idx, val) => updateListItem('regexRules', idx, val)}
                          placeholder="novartis\.com/[a-z]{2}-[a-z]{2}(/|$)"
                      />
                      <p className="text-[10px] text-muted-foreground italic mt-2">
                        Any link matching these patterns will be **skipped**. Use this to block large sections of a site.
                      </p>
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
        </div>

        {/* Right Column: JSON Engine and Actions */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
            <Card className="border-border shadow-2xl bg-card overflow-hidden flex flex-col">
                <CardHeader className="bg-white/5 pb-3 flex-row items-center justify-between border-b border-white/5 space-y-0">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <Code className="h-3.5 w-3.5" />
                        </div>
                        <CardTitle className="text-sm font-bold uppercase tracking-wider">JSON Configuration</CardTitle>
                    </div>
                    <Button variant="ghost" size="sm" onClick={copyToClipboard} className="h-8 w-8 p-0">
                        <AnimatePresence mode="wait">
                            {showCopyFeedback ? (
                                <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                                    <Check className="h-3.5 w-3.5 text-green-500" />
                                </motion.div>
                            ) : (
                                <motion.div key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Button>
                </CardHeader>
                <CardContent className="p-0">
                    <Textarea
                        className="font-mono min-h-[400px] bg-transparent text-emerald-400/80 text-[11px] resize-none border-0 focus-visible:ring-0 ring-offset-0 p-6 leading-relaxed"
                        value={jsonText}
                        onChange={handleJsonChange}
                        spellCheck={false}
                    />
                    {jsonError && (
                        <div className="px-6 pb-4">
                            <p className="text-[10px] text-destructive font-medium bg-destructive/10 p-2 rounded border border-destructive/20 flex items-center gap-2">
                                <span>⚠️</span> {jsonError}
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Start audit button moved to sidebar */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-2"
            >
                <Button 
                    onClick={handleStart} 
                    disabled={loading || !!jsonError || !config.startUrl} 
                    className="w-full h-20 text-xl rounded-lg font-black tracking-widest uppercase hover:scale-[1.02] active:scale-[0.98] shadow-hover"
                >
                    {loading ? (
                        <span className="flex items-center gap-3">
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Starting...
                        </span>
                    ) : (
                        <span className="flex items-center gap-2">
                            <Play className="h-6 w-6 fill-current" /> Start audit
                        </span>
                    )}
                </Button>
                <p className="text-[10px] text-center text-muted-foreground mt-4 px-4 italic leading-relaxed">
                    By clicking Start audit, you confirm that you have permission to crawl the target domain and will adhere to its robots.txt policies.
                </p>
                                {startError && (
                                    <p className="text-xs text-destructive mt-3 text-center">{startError}</p>
                                )}
            </motion.div>
        </div>
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
