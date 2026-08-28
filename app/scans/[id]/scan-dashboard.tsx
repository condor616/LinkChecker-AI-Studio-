'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function getStatusBadgeClass(statusCode: string | number | undefined, isBroken: boolean, isPending?: boolean): string {
  if (isPending) return "bg-blue-500 text-white";
  const code = typeof statusCode === 'string' ? parseInt(statusCode, 10) : (statusCode || 0);
  if (code >= 500) return "bg-orange-500/15 text-orange-600 dark:text-orange-400";
  if (code >= 400) return "bg-destructive/15 text-destructive";
  if (code >= 300) return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
  if (code >= 200) return "bg-green-500/10 text-green-500";
  if (isBroken) return "bg-destructive/15 text-destructive";
  return "bg-muted text-muted-foreground";
}
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isTargetUrlMatch } from '@/lib/utils/url';
import { Pause, Play, Square, Trash2, RefreshCw, ExternalLink, ChevronDown, ChevronRight, ChevronLeft, AlertCircle, CheckCircle2, Link2, Ghost, Globe, Search, Loader2, AlertTriangle, LayoutDashboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExportButton } from './export-button';

const headerOutlineChrome =
  "cursor-pointer gap-2 border-primary/50 bg-background text-foreground hover:border-primary hover:bg-primary/10 dark:border-primary/25 dark:hover:border-primary/50 dark:hover:bg-primary/5 transition-all";

const headerStopChrome =
  "h-10 px-3 cursor-pointer text-destructive border-destructive/50 bg-background hover:border-destructive hover:bg-destructive/10 hover:text-destructive dark:border-destructive/25 dark:hover:border-destructive/50 dark:hover:bg-destructive/10 transition-all group";

export function ScanDashboard({
  scanId,
  initialStatus,
  scanName,
  isTargetedScan,
}: {
  scanId: string;
  initialStatus: string;
  scanName: string;
  isTargetedScan: boolean;
}) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState(initialStatus);
  const triageContentRef = useRef<HTMLDivElement>(null);
  const [brokenPage, setBrokenPage] = useState(1);
  const [successPage, setSuccessPage] = useState(1);
  const [skippedPage, setSkippedPage] = useState(1);
  const [recheckedPage, setRecheckedPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'broken' | 'rechecked' | 'success' | 'skipped'>('broken');
  
  const initialSearch = searchParams.get('search') || '';
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [isSearching, setIsSearching] = useState(false);
  const [viewMode, setViewMode] = useState<'url' | 'source'>('url');
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isRecheckingAll, setIsRecheckingAll] = useState(false);
  const router = useRouter();
  const pageSize = 30;

  const fetchData = async (searchOverride?: string) => {
    const searchToUse = searchOverride !== undefined ? searchOverride : (searchQuery.length >= 3 ? searchQuery : '');
    const url = new URL(`/api/scans/${scanId}`, window.location.origin);
    if (searchToUse) {
      url.searchParams.set('search', searchToUse);
    }

    const res = await fetch(url.toString());
    if (res.ok) {
      const json = await res.json();
      setData(json);
      setStatus(json.scan.status);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let isMounted = true;
    
    // Initial fetch when scanId or debouncedSearch changes
    const runFetch = async () => {
      const searchToUse = debouncedSearch.length >= 3 ? debouncedSearch : '';
      setIsSearching(true);
      // Reset all pagination when search changes
      setBrokenPage(1);
      setSuccessPage(1);
      setSkippedPage(1);
      setRecheckedPage(1);
      await fetchData(searchToUse);
      if (isMounted) setIsSearching(false);
    };

    runFetch();

    // Polling fetch
    const interval = setInterval(() => {
      const searchToUse = debouncedSearch.length >= 3 ? debouncedSearch : '';
      fetchData(searchToUse);
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [scanId, debouncedSearch]);



  useEffect(() => {
    if (triageContentRef.current) {
        triageContentRef.current.scrollTop = 0;
    }
  }, [brokenPage, successPage, skippedPage, recheckedPage]);

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

  const handleStop = async () => {
    setIsStopping(true);
    try {
      const res = await fetch(`/api/scans/${scanId}`, { method: 'DELETE' });
      if (res.ok) {
        window.location.href = '/scans/history';
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsStopping(false);
      setShowStopConfirm(false);
    }
  };

  const handleRecheck = async (linkId: string) => {
    const res = await fetch(`/api/links/${linkId}/recheck`, { method: 'POST' });
    if (res.ok) {
      fetchData();
    }
  };

  const handleRecheckBroken = async () => {
    if (isRecheckingAll) return;
    setIsRecheckingAll(true);
    try {
      const res = await fetch(`/api/scans/${scanId}/recheck-broken`, { method: 'POST' });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRecheckingAll(false);
    }
  };

  const downloadBacklinkCSV = () => {
    const headers = ['Target URL', 'Source Page (Parent)', 'Status', 'Code', 'Snippet'];
    const rows = [headers.join(',')];
    
    uniqueFilteredLinks.forEach(group => {
      group.instances.forEach((inst: any) => {
        const row = [
          `"${inst.url}"`,
          `"${inst.parentUrl || ''}"`,
          `"${inst.status}"`,
          `"${inst.statusCode || ''}"`,
          `"${(inst.snippet || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
        ];
        rows.push(row.join(','));
      });
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backlinks-${scan.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`;
    a.click();
  };

  const stickyHeader = (
    <div className="sticky top-16 z-30 bg-background/95 backdrop-blur-sm border-b border-border px-8 py-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground truncate">{scanName}</h1>
          <span className={cn(
             "shrink-0 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
             status === 'RUNNING' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
             status === 'COMPLETED' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
             status === 'FAILED' ? "bg-destructive/10 text-destructive border-destructive/20" :
             "bg-slate-500/10 text-slate-400 border-slate-500/20"
          )}>
            {status}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {!isTargetedScan && (
            <ExportButton scanId={scanId} scanName={scanName} />
          )}
          {status !== 'COMPLETED' && (
            <>
              <Button
                onClick={toggleStatus}
                variant="outline"
                className={cn("h-10 w-32", headerOutlineChrome)}
              >
                {status === 'RUNNING' ? (
                  <><Pause className="h-4 w-4 text-primary" /> Pause</>
                ) : (
                  <><Play className="h-4 w-4 text-primary" /> Resume</>
                )}
              </Button>
              <Button
                onClick={() => setShowStopConfirm(true)}
                variant="outline"
                className={headerStopChrome}
                title="Stop and Delete Scan"
              >
                <Square className="h-4 w-4 fill-destructive/20 group-hover:fill-destructive transition-all" />
              </Button>
            </>
          )}
          {!isTargetedScan && (
            <Button asChild variant="outline" className={cn("h-10", headerOutlineChrome)}>
              <Link href={`/scans/${scanId}/dashboard`}>
                <LayoutDashboard className="h-4 w-4 text-primary" />
                Visual Dashboard
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  const stopConfirmDialog = (
    <AnimatePresence>
      {showStopConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-card border border-white/10 rounded-2xl shadow-2xl max-w-md w-full p-8 space-y-6 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500" />

            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">Stop and Remove Scan?</h3>
                <p className="text-sm text-muted-foreground mt-1 font-medium">This action cannot be undone.</p>
              </div>
            </div>

            <div className="bg-muted/30 rounded-xl p-4 border border-border">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Stopping this scan will <span className="text-destructive font-bold underline decoration-destructive/30 underline-offset-4">immediately terminate</span> all active processing and <span className="text-foreground font-bold">permanently remove</span> all discovered links from the database.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => setShowStopConfirm(false)}
                disabled={isStopping}
                className="hover:bg-white/5 rounded-xl font-bold"
              >
                Keep Scanning
              </Button>
              <Button
                variant="destructive"
                onClick={handleStop}
                disabled={isStopping}
                className="bg-destructive hover:bg-destructive/90 shadow-lg shadow-destructive/20 px-6 rounded-xl font-black uppercase tracking-widest text-xs h-11 text-white"
              >
                {isStopping ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Stopping...</>
                ) : (
                  'Stop and Delete'
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (!data) return (
    <>
      {stickyHeader}
      <div className="px-8 pt-8 pb-10">
        <div className="flex items-center justify-center p-20">
          <RefreshCw className="h-10 w-10 animate-spin text-primary/50" />
        </div>
      </div>
      {stopConfirmDialog}
    </>
  );

  const { links, scan } = data;
  
  // Parse config for filtering
  let config: any = {};
  try {
    config = typeof scan.config === 'string' ? JSON.parse(scan.config) : scan.config;
  } catch (e) {}
  
  const startUrl = config.startUrl || '';
  const internalDomain = startUrl ? new URL(startUrl).hostname.toLowerCase().replace(/^www\./, '') : '';
  const isTargeted = !!config.isTargeted && (config.targetUrls?.length > 0);
  const targetUrls = config.targetUrls || [];

    const matchesTarget = (url: string) => {
        return targetUrls.some((target: string) => isTargetUrlMatch(url, target));
    };

  const isUrlInternal = (url: string) => {
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      return host === internalDomain || (host.endsWith('.' + internalDomain) && !config.excludeSubdomains);
    } catch (e) {
      return url.startsWith('/');
    }
  };

  // Filter links:
  // 1. If targeted: only targets.
  // 2. Regular: Only links found ON internal pages (or the entry point).
  const groupLinks = (links: any[]) => {
    const grouped: Record<string, any[]> = {};
    links.forEach(link => {
        const normalizedUrl = link.url.replace(/^https?:\/\//, '').toLowerCase();
        if (!grouped[normalizedUrl]) {
            grouped[normalizedUrl] = [];
        }
        grouped[normalizedUrl].push(link);
    });
    return Object.entries(grouped).map(([normalizedKey, instances]) => {
        const displayUrl = instances.find(inst => inst.url.startsWith('https'))?.url || instances[0].url;
        return {
            url: displayUrl,
            normalizedKey,
            instances,
            ...instances[0], 
            count: instances.length
        };
    });
  };

  const groupLinksBySource = (links: any[]) => {
    const grouped: Record<string, any[]> = {};
    links.forEach(link => {
        const source = link.parentUrl || 'Entry Point';
        if (!grouped[source]) {
            grouped[source] = [];
        }
        grouped[source].push(link);
    });
    return Object.entries(grouped).map(([source, instances]) => {
        return {
            url: source,
            instances,
            status: instances.some(i => i.status === 'BROKEN') ? 'BROKEN' : 'SUCCESS',
            count: instances.length
        };
    });
  };

  const filteredLinks = links.filter((l: any) => {
    // ALWAYS include SKIPPED links if they were recorded and found on a relevant page
    if (l.status === 'SKIPPED') {
      if (isTargeted) {
        // In targeted scans, show skipped links if their parent was targeted
                return !l.parentUrl || matchesTarget(l.parentUrl);
      }
      // In regular scans, show skipped links if their parent was internal
      const parent = l.parentUrl;
      if (!parent) return true;
      return isUrlInternal(parent);
    }

    if (isTargeted) {
      // If the link itself is a target, show it
        const isTarget = matchesTarget(l.url);
      if (isTarget) return true;

      // If the link is BROKEN and found on a target page, show it (important for reporting broken external links)
      if (l.status === 'BROKEN' && l.parentUrl) {
                return matchesTarget(l.parentUrl);
      }

      return false;
    }
    
    const parent = l.parentUrl;
    if (!parent) return true; // Entry point
    return isUrlInternal(parent);
  });

  const uniqueFilteredLinks = groupLinks(filteredLinks);
  const total = uniqueFilteredLinks.length;
  const pending = filteredLinks.filter((l: any) => l.status === 'PENDING').length;
  // Raw counts for internal use if needed, but UI uses unique counts derived below
  
  const progress = links.length > 0 ? ((links.length - links.filter((l: any) => l.status === 'PENDING').length) / links.length) * 100 : 0;

  const brokenLinksRaw = filteredLinks.filter((l: any) => l.status === 'BROKEN');
  const successLinksRaw = filteredLinks.filter((l: any) => l.status === 'SUCCESS' && !l.isRechecked);
  const skippedLinksRaw = filteredLinks.filter((l: any) => l.status === 'SKIPPED' && !l.isRechecked);
  const recheckedLinksRaw = filteredLinks.filter((l: any) => l.isRechecked);


  const brokenLinks = groupLinks(brokenLinksRaw);
  const successLinks = groupLinks(successLinksRaw);
  const skippedLinks = groupLinks(skippedLinksRaw);

  const brokenCount = brokenLinks.length;
  const successCount = successLinks.length;
  const skippedCount = skippedLinks.length;
  const recheckedLinks = groupLinks(recheckedLinksRaw);
  const recheckedCount = recheckedLinks.length;

  const currentBrokenGroups = viewMode === 'url' ? brokenLinks : groupLinksBySource(brokenLinksRaw);
  const currentSuccessGroups = viewMode === 'url' ? successLinks : groupLinksBySource(successLinksRaw);
  const currentSkippedGroups = viewMode === 'url' ? skippedLinks : groupLinksBySource(skippedLinksRaw);
  const currentRecheckedGroups = viewMode === 'url' ? recheckedLinks : groupLinksBySource(recheckedLinksRaw);

  const paginatedBroken = currentBrokenGroups.slice((brokenPage - 1) * pageSize, brokenPage * pageSize);
  const paginatedSuccess = currentSuccessGroups.slice((successPage - 1) * pageSize, successPage * pageSize);
  const paginatedSkipped = currentSkippedGroups.slice((skippedPage - 1) * pageSize, skippedPage * pageSize);
  const paginatedRechecked = currentRecheckedGroups.slice((recheckedPage - 1) * pageSize, recheckedPage * pageSize);

  // Discovery: unique target URLs seen so far (any status). Orphans are only reported after the crawl finishes.
  const isScanComplete = status === 'COMPLETED';
  const targetHitGroups = uniqueFilteredLinks.filter(l => matchesTarget(l.url));
  const foundMatchCount = targetHitGroups.reduce((sum, group) => sum + (group.count || 0), 0);
  const undiscoveredTargets = isTargeted ? targetUrls.filter((t: string) => {
    return !uniqueFilteredLinks.some(l => isTargetUrlMatch(l.url, t));
  }) : [];
  const missingTargets = isScanComplete ? undiscoveredTargets : [];
  const foundTargetCount = targetUrls.length - undiscoveredTargets.length;
  const coveragePercent = targetUrls.length > 0 ? (foundTargetCount / targetUrls.length) * 100 : 0;

  // Stats specific to the crawl progress (unfiltered)
  const pagesCrawled = links.filter((l: any) => l.type?.includes('html') && l.status !== 'PENDING').length;
  const globalPending = links.filter((l: any) => l.status === 'PENDING').length;

  return (
    <>
    {stickyHeader}
    <div className="px-8 pt-8 pb-10 space-y-8">
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <span>{isTargeted ? 'Crawl Progress' : 'Overall Progress'}</span>
                <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden border">
                <motion.div 
                   className="h-full bg-primary"
                   initial={{ width: 0 }}
                   animate={{ width: `${progress}%` }}
                   transition={{ type: "spring", stiffness: 50 }}
                />
            </div>
        </div>

      {isTargeted ? (
        <div className="flex flex-wrap items-stretch gap-4">
          <div className="min-w-0 max-w-xl bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="space-y-1.5 min-w-0 max-w-sm">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Targeted Audit Active
              </h3>
              <p className="text-xs text-muted-foreground">
                <strong>{foundMatchCount}</strong> matching {foundMatchCount === 1 ? 'URL' : 'URLs'} across <strong>{foundTargetCount}</strong> of <strong>{targetUrls.length}</strong> targets
              </p>
              <div className="w-40 h-1 bg-primary/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${coveragePercent}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="text-center">
                <div className="text-[10px] font-black opacity-50 uppercase tracking-widest leading-none mb-1">URLs Found</div>
                <div className="text-xl font-black text-green-500 leading-none">{foundMatchCount}</div>
              </div>
              {missingTargets.length > 0 && (
                <div className="text-center">
                  <div className="text-[10px] font-black opacity-50 uppercase tracking-widest leading-none mb-1">Missing</div>
                  <div className="text-xl font-black text-destructive leading-none">{missingTargets.length}</div>
                </div>
              )}
              <div className="h-8 w-px bg-border hidden sm:block" />
              <Button size="sm" onClick={downloadBacklinkCSV} className="h-8 px-3">
                <ExternalLink className="mr-2 h-3.5 w-3.5" /> Export Backlinks
              </Button>
            </div>
          </div>

          <div className="flex-1 min-w-[min(100%,18rem)] grid gap-4 grid-cols-2">
            <StatCard title="Pages Crawled" value={pagesCrawled} icon={<Globe className="h-4 w-4" />} />
            <StatCard title="Crawl Queue" value={globalPending} icon={<RefreshCw className={cn("h-4 w-4", status === 'RUNNING' && "animate-spin")} />} color="text-blue-500" />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
          <StatCard title="Total Found" value={total} icon={<Link2 className="h-4 w-4" />} />
          <StatCard
            title="Checking"
            value={pending}
            icon={<RefreshCw className={cn("h-4 w-4", status === 'RUNNING' && "animate-spin")} />}
            color="text-blue-500"
          />
          <StatCard title="Healthy" value={successCount} icon={<CheckCircle2 className="h-4 w-4" />} color="text-green-500" />
          <StatCard title="Broken" value={brokenCount} icon={<AlertCircle className="h-4 w-4" />} color="text-destructive" highlight={brokenCount > 0} />
          <StatCard title="Skipped" value={skippedCount} icon={<Ghost className="h-4 w-4" />} color="text-slate-500" />
        </div>
      )}

      {/* Terminal and Triage */}
      <div className="flex flex-col gap-8 pb-20">
        {isTargeted && missingTargets.length > 0 && (
            <Card className="border-destructive/20 bg-destructive/5">
                <CardHeader className="py-3">
                    <CardTitle className="text-sm font-bold uppercase tracking-widest text-destructive flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Missing / Orphaned Targets ({missingTargets.length})
                    </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 pt-0">
                    <p className="text-[11px] text-muted-foreground mb-3">The following requested URLs were not found after the crawl finished. These assets are either unlinked or the crawler could not discover a path to them.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {missingTargets.map((t: string) => (
                            <div key={t} className="px-3 py-1.5 rounded bg-black/20 border border-white/5 text-[10px] font-mono text-destructive/80 break-all flex items-center justify-between group">
                                {t}
                                <Ghost className="h-3 w-3 opacity-20 group-hover:opacity-100 transition-opacity" />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        )}

        {/* Triage Section (Now at the top) */}
        <div className="w-full order-1">
            <Card className="min-h-[500px] flex flex-col shadow-xl border-primary/5">
                <Tabs
                    value={activeTab}
                    onValueChange={(value) => {
                        if (value === 'broken' || value === 'rechecked' || value === 'success' || value === 'skipped') {
                            setActiveTab(value);
                        }
                    }}
                    className="flex flex-col h-full"
                >
                    <CardHeader className="py-3 px-4 border-b sticky top-0 bg-background/80 backdrop-blur-md z-10 space-y-0">
                        {/* Row 1: Title + Search + View Toggle */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
                            <CardTitle className="text-lg flex items-center gap-2 shrink-0">
                                {isTargeted ? 'Audit Results' : 'Report Triage'}
                                {isSearching && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                            </CardTitle>
                            
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto sm:justify-end">
                                <div className="relative w-full sm:max-w-xs">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search URLs..."
                                        className="pl-9 h-9"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                
                                {!isTargeted && (
                                    <div className="flex border rounded-lg bg-muted/30 p-0.5 shrink-0 w-full sm:w-auto">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className={cn("h-7 px-3 text-[10px] font-bold uppercase tracking-tight flex-1 sm:flex-none", viewMode === 'url' ? "bg-background shadow-sm" : "opacity-50")}
                                            onClick={() => setViewMode('url')}
                                        >
                                            By URL
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className={cn("h-7 px-3 text-[10px] font-bold uppercase tracking-tight flex-1 sm:flex-none", viewMode === 'source' ? "bg-background shadow-sm" : "opacity-50")}
                                            onClick={() => setViewMode('source')}
                                        >
                                            By Page
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Row 2: Filter Tabs - Desktop */}
                        {!isTargeted && (
                            <>
                                {/* Mobile: Compact Filter Buttons */}
                                <div className="flex md:hidden gap-1.5 pt-3 pb-2 overflow-x-auto scrollbar-hide">
                                    <Button
                                        variant={activeTab === 'broken' ? 'default' : 'outline'}
                                        size="sm"
                                        className="h-7 px-2.5 text-[10px] font-bold uppercase tracking-tight whitespace-nowrap flex-shrink-0"
                                        onClick={() => setActiveTab('broken')}
                                    >
                                        <span className="font-black px-1 py-0 rounded bg-current/20 text-current inline-block mr-1">{currentBrokenGroups.length}</span>
                                        Broken
                                    </Button>
                                    <Button
                                        variant={activeTab === 'rechecked' ? 'default' : 'outline'}
                                        size="sm"
                                        className="h-7 px-2.5 text-[10px] font-bold uppercase tracking-tight whitespace-nowrap flex-shrink-0"
                                        onClick={() => setActiveTab('rechecked')}
                                    >
                                        <span className="font-black px-1 py-0 rounded bg-current/20 text-current inline-block mr-1">{currentRecheckedGroups.length}</span>
                                        Checked
                                    </Button>
                                    <Button
                                        variant={activeTab === 'success' ? 'default' : 'outline'}
                                        size="sm"
                                        className="h-7 px-2.5 text-[10px] font-bold uppercase tracking-tight whitespace-nowrap flex-shrink-0"
                                        onClick={() => setActiveTab('success')}
                                    >
                                        <span className="font-black px-1 py-0 rounded bg-current/20 text-current inline-block mr-1">{currentSuccessGroups.length}</span>
                                        OK
                                    </Button>
                                    <Button
                                        variant={activeTab === 'skipped' ? 'default' : 'outline'}
                                        size="sm"
                                        className="h-7 px-2.5 text-[10px] font-bold uppercase tracking-tight whitespace-nowrap flex-shrink-0"
                                        onClick={() => setActiveTab('skipped')}
                                    >
                                        <span className="font-black px-1 py-0 rounded bg-current/20 text-current inline-block mr-1">{currentSkippedGroups.length}</span>
                                        Skip
                                    </Button>
                                </div>

                                {/* Desktop: Full Tabs */}
                                <div className="hidden md:block w-full overflow-x-auto -mx-6 px-6 scrollbar-hide pt-3 pb-2">
                                    <TabsList className="w-full justify-start inline-flex">
                                        <TabsTrigger value="broken" className="text-destructive data-[state=active]:border-b-destructive flex-shrink-0">
                                            Broken <span className="ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">{currentBrokenGroups.length}</span>
                                        </TabsTrigger>
                                        <TabsTrigger value="rechecked" className="text-blue-500 data-[state=active]:border-b-blue-500 flex-shrink-0">
                                            Re-checked <span className="ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">{currentRecheckedGroups.length}</span>
                                        </TabsTrigger>
                                        <TabsTrigger value="success" className="flex-shrink-0">
                                            Success <span className="ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">{currentSuccessGroups.length}</span>
                                        </TabsTrigger>
                                        <TabsTrigger value="skipped" className="flex-shrink-0">
                                            Skipped <span className="ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{currentSkippedGroups.length}</span>
                                        </TabsTrigger>
                                    </TabsList>
                                </div>
                            </>
                        )}
                    </CardHeader>
                    <CardContent ref={triageContentRef} className="flex-1 min-w-0 overflow-auto p-0 flex flex-col">
                        {isTargeted ? (
                            <div className="divide-y flex-1">
                                {groupLinks(filteredLinks).map((group: any) => (
                                    <TriageItemGeneral key={group.url} group={group} onRecheck={handleRecheck} />
                                ))}
                                {filteredLinks.length === 0 && (
                                    <EmptyState message="No target instances found yet. The engine is still scanning..." />
                                )}
                            </div>
                        ) : (
                            <>
                                <TabsContent value="broken" className="m-0 focus-visible:ring-0 flex-1 flex flex-col">
                            {brokenLinks.length === 0 ? (
                                <EmptyState message="No broken links found. Looking good!" />
                            ) : (
                                <>
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 bg-destructive/5 border-b border-destructive/10">
                                        <div className="flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4 text-destructive" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-destructive">Broken Links Detected ({currentBrokenGroups.length})</span>
                                        </div>
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest border-destructive/20 hover:bg-destructive/10 hover:text-destructive hover:border-destructive transition-all shadow-sm w-full sm:w-auto"
                                            onClick={handleRecheckBroken}
                                            disabled={isRecheckingAll || currentBrokenGroups.length === 0}
                                        >
                                            {isRecheckingAll ? (
                                                <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Re-checking...</>
                                            ) : (
                                                <><RefreshCw className="mr-2 h-3 w-3" /> Re-check All Broken</>
                                            )}
                                        </Button>
                                    </div>
                                    <PaginationControls 
                                        currentPage={brokenPage} 
                                        totalItems={currentBrokenGroups.length} 
                                        pageSize={pageSize} 
                                        onPageChange={setBrokenPage} 
                                        position="top"
                                    />
                                    <div className="divide-y flex-1">
                                        {paginatedBroken.map((group: any) => (
                                            viewMode === 'url' ? (
                                                <TriageItem key={group.url} group={group} onRecheck={handleRecheck} />
                                            ) : (
                                                <TriageItemSource key={group.url} group={group} onRecheck={handleRecheck} />
                                            )
                                        ))}
                                    </div>
                                    <PaginationControls 
                                        currentPage={brokenPage} 
                                        totalItems={currentBrokenGroups.length} 
                                        pageSize={pageSize} 
                                        onPageChange={setBrokenPage} 
                                        position="bottom"
                                    />
                                </>
                            )}
                        </TabsContent>
                        <TabsContent value="rechecked" className="m-0 flex-1 flex flex-col">
                             <div className="divide-y text-xs text-muted-foreground/60 flex-1">
                                {currentRecheckedGroups.length === 0 ? (
                                    <div className="p-12 text-center text-sm italic text-muted-foreground">
                                        No links have been manually re-checked yet.
                                    </div>
                                ) : (
                                    <>
                                        {currentRecheckedGroups.length > pageSize && (
                                            <PaginationControls 
                                                currentPage={recheckedPage} 
                                                totalItems={currentRecheckedGroups.length} 
                                                pageSize={pageSize} 
                                                onPageChange={setRecheckedPage} 
                                                position="top"
                                            />
                                        )}
                                        {paginatedRechecked.map((group: any) => (
                                            viewMode === 'url' ? (
                                                <TriageItemRechecked key={group.url} group={group} onRecheck={handleRecheck} />
                                            ) : (
                                                <TriageItemSource key={group.url} group={group} onRecheck={handleRecheck} />
                                            )
                                        ))}
                                        {currentRecheckedGroups.length > pageSize && (
                                            <PaginationControls 
                                                currentPage={recheckedPage} 
                                                totalItems={currentRecheckedGroups.length} 
                                                pageSize={pageSize} 
                                                onPageChange={setRecheckedPage} 
                                                position="bottom"
                                            />
                                        )}
                                    </>
                                )}
                             </div>
                        </TabsContent>
                        <TabsContent value="success" className="m-0 flex-1 flex flex-col">
                             <div className="divide-y text-xs text-muted-foreground/60 flex-1">
                                {currentSuccessGroups.length > pageSize && (
                                    <PaginationControls 
                                        currentPage={successPage} 
                                        totalItems={currentSuccessGroups.length} 
                                        pageSize={pageSize} 
                                        onPageChange={setSuccessPage} 
                                        position="top"
                                    />
                                )}
                                {paginatedSuccess.map((group: any) => (
                                    viewMode === 'url' ? (
                                        <TriageItemSuccess key={group.url} group={group} />
                                    ) : (
                                        <TriageItemSource key={group.url} group={group} onRecheck={handleRecheck} />
                                    )
                                ))}
                             </div>
                             {currentSuccessGroups.length > pageSize && (
                                <PaginationControls 
                                    currentPage={successPage} 
                                    totalItems={currentSuccessGroups.length} 
                                    pageSize={pageSize} 
                                    onPageChange={setSuccessPage} 
                                    position="bottom"
                                />
                             )}
                        </TabsContent>
                        <TabsContent value="skipped" className="m-0 flex-1 flex flex-col">
                             <div className="divide-y text-xs text-muted-foreground/60 flex-1">
                                {currentSkippedGroups.length > pageSize && (
                                    <PaginationControls 
                                        currentPage={skippedPage} 
                                        totalItems={currentSkippedGroups.length} 
                                        pageSize={pageSize} 
                                        onPageChange={setSkippedPage} 
                                        position="top"
                                    />
                                )}
                                {paginatedSkipped.map((group: any) => (
                                    viewMode === 'url' ? (
                                        <TriageItemSkipped key={group.url} group={group} />
                                    ) : (
                                        <TriageItemSource key={group.url} group={group} onRecheck={handleRecheck} />
                                    )
                                ))}
                                {currentSkippedGroups.length === 0 && (
                                    <div className="p-12 text-center text-sm italic text-muted-foreground">
                                        No links skipped.
                                    </div>
                                )}
                             </div>
                             {currentSkippedGroups.length > pageSize && (
                                <PaginationControls 
                                    currentPage={skippedPage} 
                                    totalItems={currentSkippedGroups.length} 
                                    pageSize={pageSize} 
                                    onPageChange={setSkippedPage} 
                                    position="bottom"
                                />
                             )}
                        </TabsContent>
                             </>
                        )}
                    </CardContent>
                </Tabs>
            </Card>
        </div>
      </div>
    </div>
    </div>
    {stopConfirmDialog}
    </>
  );
}


function PaginationControls({ currentPage, totalItems, pageSize, onPageChange, position = 'bottom' }: any) {
    const totalPages = Math.ceil(totalItems / pageSize);
    if (totalPages <= 1) return null;

    // Build page number array with ellipsis
    const getPages = () => {
        const pages: (number | '...')[] = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (currentPage > 3) pages.push('...');
            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);
            for (let i = start; i <= end; i++) pages.push(i);
            if (currentPage < totalPages - 2) pages.push('...');
            pages.push(totalPages);
        }
        return pages;
    };

    return (
        <div className={cn(
            "flex items-center justify-between px-4 py-2.5 bg-muted/5",
            position === 'bottom' ? "border-t" : "border-b"
        )}>
            <div className="text-[10px] text-muted-foreground font-medium">
                <span className="font-bold text-foreground">{totalItems.toLocaleString()}</span> results &middot; page <span className="font-bold text-foreground">{currentPage}</span> of <span className="font-bold text-foreground">{totalPages}</span>
            </div>
            <div className="flex items-center gap-1">
                <button
                    className={cn(
                        "h-8 w-8 rounded-md flex items-center justify-center text-sm transition-colors border",
                        currentPage === 1
                            ? "opacity-30 cursor-not-allowed border-transparent"
                            : "hover:bg-muted border-border hover:border-primary/30 cursor-pointer"
                    )}
                    disabled={currentPage === 1}
                    onClick={() => onPageChange(currentPage - 1)}
                    aria-label="Previous page"
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                {getPages().map((page, i) =>
                    page === '...' ? (
                        <span key={`ellipsis-${i}`} className="h-8 w-8 flex items-center justify-center text-xs text-muted-foreground">…</span>
                    ) : (
                        <button
                            key={page}
                            onClick={() => onPageChange(page)}
                            className={cn(
                                "h-8 w-8 rounded-md flex items-center justify-center text-xs font-medium transition-colors border",
                                page === currentPage
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "hover:bg-muted border-border hover:border-primary/30 text-muted-foreground cursor-pointer"
                            )}
                            aria-current={page === currentPage ? 'page' : undefined}
                        >
                            {page}
                        </button>
                    )
                )}

                <button
                    className={cn(
                        "h-8 w-8 rounded-md flex items-center justify-center text-sm transition-colors border",
                        currentPage === totalPages
                            ? "opacity-30 cursor-not-allowed border-transparent"
                            : "hover:bg-muted border-border hover:border-primary/30 cursor-pointer"
                    )}
                    disabled={currentPage === totalPages}
                    onClick={() => onPageChange(currentPage + 1)}
                    aria-label="Next page"
                >
                    <ChevronRight className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon, color = "", highlight = false }: any) {
    const displayValue = typeof value === 'number' ? value.toLocaleString() : value;
    return (
        <Card className={cn(
            "h-full bg-card/50 backdrop-blur-sm shadow-md transition-colors",
            highlight ? "border-destructive/30 bg-destructive/5" : "border-primary/10"
        )}>
            <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between space-y-0 text-muted-foreground">
                <CardTitle className="text-[10px] font-bold uppercase tracking-widest">{title}</CardTitle>
                {icon}
            </CardHeader>
            <CardContent className="p-4 pt-1">
                <div className={`text-2xl font-bold ${color}`}>{displayValue}</div>
            </CardContent>
        </Card>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="flex flex-col items-center justify-center p-20 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mb-4 text-green-500/20" />
            <p className="text-sm italic">{message}</p>
        </div>
    );
}

function isHtmlSnippet(snippet?: string | null) {
    if (!snippet) return false;
    return snippet.includes('<');
}

function getSnippetTag(snippet?: string | null) {
    if (!snippet?.startsWith('[') || snippet.includes('<')) return null;
    const end = snippet.indexOf(']');
    return end >= 0 ? snippet.slice(0, end + 1) : snippet;
}

function FoundOnTable({
    instances,
    groupUrl,
    groupCount,
    showAll,
    onShowAll,
    groupError,
}: {
    instances: any[];
    groupUrl: string;
    groupCount: number;
    showAll: boolean;
    onShowAll: () => void;
    groupError?: string | null;
}) {
    const [openSnippets, setOpenSnippets] = useState<Record<string, boolean>>({});
    const visibleInstances = showAll ? instances : instances.slice(0, 10);
    const anyHtml = visibleInstances.some((inst: any) => isHtmlSnippet(inst.snippet));

    const toggleSnippet = (key: string) => {
        setOpenSnippets((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="min-w-0 max-w-full overflow-hidden">
            {groupError && (
                <div className="px-4 py-2 text-[11px] font-mono text-red-600/90 dark:text-red-400/80 border-b border-red-500/10 bg-red-500/5 break-all leading-relaxed">
                    {groupError}
                </div>
            )}
            <table className="w-full table-fixed text-left">
                <thead>
                    <tr className="border-b border-border/60">
                        <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground min-w-0">
                            Found on
                        </th>
                        {anyHtml && (
                            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right w-[7.5rem]">
                                HTML
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {visibleInstances.map((inst: any, i: number) => {
                        const key = String(inst.id ?? `${inst.parentUrl}-${i}`);
                        const hasHtml = isHtmlSnippet(inst.snippet);
                        const tag = getSnippetTag(inst.snippet);
                        const open = !!openSnippets[key];
                        const rowError = inst.error && inst.error !== groupError ? inst.error : null;
                        return (
                            <tr key={key} className="border-b border-border/40 last:border-0 align-top">
                                <td className="px-4 py-2.5 min-w-0">
                                    <div className="flex items-start gap-1.5 min-w-0 max-w-full">
                                        {inst.parentUrl ? (
                                            <a
                                                href={inst.parentUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="min-w-0 max-w-full text-sm font-medium text-foreground hover:text-primary hover:underline break-all leading-snug flex items-start gap-1.5"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <span className="min-w-0 break-all">{inst.parentUrl}</span>
                                                <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/40" />
                                            </a>
                                        ) : (
                                            <span className="text-sm text-muted-foreground">Start</span>
                                        )}
                                    </div>
                                    {inst.url !== groupUrl && (
                                        <div className="mt-0.5 text-[10px] font-mono text-muted-foreground/70 break-all">
                                            Specific URL: {inst.url}
                                        </div>
                                    )}
                                    {rowError && (
                                        <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-500/80 break-all">
                                            {rowError}
                                        </div>
                                    )}
                                    {tag && (
                                        <div className="mt-0.5 text-[10px] font-mono italic text-primary/70">
                                            {tag}
                                        </div>
                                    )}
                                    {hasHtml && open && (
                                        <div className="mt-2 min-w-0 max-w-full overflow-x-auto">
                                            <pre className="text-[9px] font-mono bg-slate-900 text-slate-300 p-2 rounded-md border border-slate-800 max-h-40 max-w-full whitespace-pre-wrap break-all [overflow-wrap:anywhere]">
                                                {inst.snippet}
                                            </pre>
                                        </div>
                                    )}
                                </td>
                                {anyHtml && (
                                    <td className="px-3 py-2 text-right align-top">
                                        {hasHtml && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleSnippet(key);
                                                }}
                                            >
                                                {open ? 'Hide HTML' : 'Show HTML'}
                                            </Button>
                                        )}
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {instances.length > 10 && !showAll && (
                <Button
                    variant="ghost"
                    className="w-full text-[10px] font-bold uppercase tracking-widest h-8 text-primary/60 hover:text-primary transition-colors hover:bg-primary/5 rounded-none border-t border-border/40"
                    onClick={onShowAll}
                >
                    Show all {groupCount} occurrences
                </Button>
            )}
        </div>
    );
}

function TriageItemGeneral({ group, onRecheck }: any) {
    const [expanded, setExpanded] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const link = group;
    const isBroken = link.status === 'BROKEN';
    const isSuccess = link.status === 'SUCCESS';
    const isPending = link.status === 'PENDING' || link.status === 'PROCESSING';

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
                "border-l-4 transition-colors overflow-hidden",
                isBroken ? "border-l-destructive hover:bg-destructive/5" :
                isSuccess ? "border-l-green-500 hover:bg-green-500/5" :
                "border-l-blue-500 hover:bg-blue-500/5"
            )}
        >
            <div className="h-12 px-4 flex items-center justify-between gap-4 cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                     {group.count > 1 && (
                        <span
                            className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0"
                            title={`${group.count} occurrences`}
                        >
                            {group.count}
                        </span>
                    )}
                    <span className={cn(
                        "font-medium text-sm break-words",
                        isBroken ? "text-destructive" : isSuccess ? "text-green-600 dark:text-green-400" : "text-blue-500"
                    )}>
                        {link.url}
                    </span>
                    <a 
                        href={link.url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-muted-foreground/40 hover:text-primary shrink-0 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                        title="Open in new tab"
                    >
                        <ExternalLink className="h-3 w-3" />
                    </a>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                     <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter",
                        isPending ? "bg-blue-500 text-white flex items-center gap-1" :
                        getStatusBadgeClass(link.statusCode, isBroken, isPending)
                    )}>
                        {isPending && <RefreshCw className="h-3 w-3 animate-spin" />}
                        {isPending ? 'CHECKING' : link.statusCode ? `${link.statusCode}${isSuccess ? ' OK' : ''}` : (isBroken ? 'FAIL' : '—')}
                    </span>
                    {expanded ? <ChevronDown className="h-4 w-4 opacity-50" /> : <ChevronRight className="h-4 w-4 opacity-50" />}
                </div>
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-muted/20 border-t"
                    >
                        <FoundOnTable
                            instances={group.instances}
                            groupUrl={link.url}
                            groupCount={group.count}
                            showAll={showAll}
                            onShowAll={() => setShowAll(true)}
                            groupError={isBroken ? link.error : null}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function TriageItem({ group, onRecheck }: any) {
    const [expanded, setExpanded] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const link = group; // primary info

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="border-l-4 border-l-red-500 hover:bg-muted/30 transition-colors overflow-hidden"
        >
            <div className="h-12 px-4 flex items-center justify-between gap-4 cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {group.count > 1 && (
                        <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                            {group.count}
                        </span>
                    )}
                    <a 
                        href={link.url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="font-medium text-sm text-destructive hover:underline break-words"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {link.url}
                    </a>
                    <ExternalLink className="h-3 w-3 text-destructive/50 shrink-0" />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter",
                        getStatusBadgeClass(link.statusCode, true)
                    )}>
                        {link.statusCode || 'FAIL'}
                    </span>
                    <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:border-primary/50 transition-all" 
                        onClick={(e) => { e.stopPropagation(); onRecheck(link.id); }}
                        title="Re-check link"
                        aria-label="Re-check link"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    {expanded ? <ChevronDown className="h-4 w-4 opacity-50" /> : <ChevronRight className="h-4 w-4 opacity-50" />}
                </div>
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-muted/20 border-t"
                    >
                        <FoundOnTable
                            instances={group.instances}
                            groupUrl={link.url}
                            groupCount={group.count}
                            showAll={showAll}
                            onShowAll={() => setShowAll(true)}
                            groupError={link.error}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function TriageItemSuccess({ group }: any) {
    const [expanded, setExpanded] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const link = group;

    return (
        <div className="border-l-4 border-l-green-500 hover:bg-green-500/5 transition-colors overflow-hidden">
            <div className="h-12 px-4 flex items-center justify-between gap-4 cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {group.count > 1 && (
                        <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                            {group.count}
                        </span>
                    )}
                    <span className="font-medium text-sm text-green-600 dark:text-green-400 break-words">{link.url}</span>
                    <a 
                        href={link.url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-muted-foreground/40 hover:text-primary shrink-0 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                        title="Open in new tab"
                    >
                        <ExternalLink className="h-3 w-3" />
                    </a>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-tighter",
                        getStatusBadgeClass(link.statusCode, false)
                    )}>{link.statusCode || 200} OK</span>
                    {expanded ? <ChevronDown className="h-4 w-4 opacity-50" /> : <ChevronRight className="h-4 w-4 opacity-50" />}
                </div>
            </div>
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-muted/20 border-t"
                    >
                        <FoundOnTable
                            instances={group.instances}
                            groupUrl={link.url}
                            groupCount={group.count}
                            showAll={showAll}
                            onShowAll={() => setShowAll(true)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function TriageItemSkipped({ group }: any) {
    const [expanded, setExpanded] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const link = group;

    return (
        <div className="hover:bg-muted/10 transition-colors border-l-4 border-l-transparent overflow-hidden">
             <div className="h-12 px-4 flex items-center justify-between gap-4 cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {group.count > 1 && (
                        <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                            {group.count}
                        </span>
                    )}
                    <span className="font-medium text-slate-400 text-sm break-words">{link.url}</span>
                    <a 
                        href={link.url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-muted-foreground/40 hover:text-primary shrink-0 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                        title="Open in new tab"
                    >
                        <ExternalLink className="h-3 w-3" />
                    </a>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className="bg-slate-500/10 text-slate-500 px-1.5 py-0.5 rounded-sm text-[10px] uppercase font-bold tracking-tighter">Skipped</span>
                    {expanded ? <ChevronDown className="h-4 w-4 opacity-50" /> : <ChevronRight className="h-4 w-4 opacity-50" />}
                </div>
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-muted/20 border-t"
                    >
                        <FoundOnTable
                            instances={group.instances}
                            groupUrl={link.url}
                            groupCount={group.count}
                            showAll={showAll}
                            onShowAll={() => setShowAll(true)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function TriageItemRechecked({ group, onRecheck }: any) {
    const [expanded, setExpanded] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const link = group;
    const isBroken = link.status === 'BROKEN';
    const isSuccess = link.status === 'SUCCESS';
    const isPending = link.status === 'PENDING';

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
                "border-l-4 transition-colors overflow-hidden",
                isBroken ? "border-l-destructive hover:bg-destructive/5 text-slate-800 dark:text-slate-200" : 
                isSuccess ? "border-l-green-500 hover:bg-green-500/5" :
                "border-l-blue-500 hover:bg-blue-500/5"
            )}
        >
            <div className="h-12 px-4 flex items-center justify-between gap-4 cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {group.count > 1 && (
                        <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                            {group.count}
                        </span>
                    )}
                    <a 
                        href={link.url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className={cn(
                            "font-medium text-sm break-words hover:underline",
                            isBroken ? "text-destructive" : isSuccess ? "text-green-600 dark:text-green-400" : "text-blue-500"
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {link.url}
                    </a>
                    <ExternalLink className={cn("h-3 w-3 shrink-0", isBroken ? "text-destructive/50" : "text-muted-foreground/40")} />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter",
                        isPending ? "bg-blue-500 text-white flex items-center gap-1" :
                        getStatusBadgeClass(link.statusCode, isBroken)
                    )}>
                        {isPending && <RefreshCw className="h-3 w-3 animate-spin inline mr-1" />}
                        {isPending ? 'CHECKING' : link.statusCode || (isBroken ? 'FAIL' : '200 OK')}
                    </span>
                    <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:border-primary/50 transition-all" 
                        onClick={(e) => { e.stopPropagation(); onRecheck(link.id); }} 
                        disabled={isPending}
                        title="Re-check link"
                        aria-label="Re-check link"
                    >
                        <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
                    </Button>
                    {expanded ? <ChevronDown className="h-4 w-4 opacity-50" /> : <ChevronRight className="h-4 w-4 opacity-50" />}
                </div>
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-muted/20 border-t"
                    >
                        <FoundOnTable
                            instances={group.instances}
                            groupUrl={link.url}
                            groupCount={group.count}
                            showAll={showAll}
                            onShowAll={() => setShowAll(true)}
                            groupError={isBroken ? link.error : null}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function TriageItemSource({ group, onRecheck }: any) {
    const [expanded, setExpanded] = useState(false);
    const hasBroken = group.instances.some((i: any) => i.status === 'BROKEN');

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
                "border-l-4 transition-colors overflow-hidden",
                hasBroken ? "border-l-destructive hover:bg-destructive/5 shadow-[inset_4px_0_0_rgba(var(--destructive),0.2)]" : "border-l-green-500 hover:bg-green-500/5"
            )}
        >
            <div className="h-12 px-4 flex items-center justify-between gap-4 cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                        {group.count} {group.count === 1 ? 'link' : 'links'}
                    </span>
                    <span className={cn(
                        "font-medium text-sm break-words",
                        hasBroken ? "text-destructive" : "text-green-600 dark:text-green-400"
                    )}>
                        {group.url}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                     <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter",
                        hasBroken ? "bg-destructive/15 text-destructive shadow-sm" : "bg-green-500/10 text-green-500"
                    )}>
                        {hasBroken ? 'FIX NEEDED' : 'CLEAN'}
                    </span>
                    {expanded ? <ChevronDown className="h-4 w-4 opacity-50" /> : <ChevronRight className="h-4 w-4 opacity-50" />}
                </div>
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-muted/20 border-t"
                    >
                        <div className="p-4 space-y-3">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 opacity-50">Links on this page:</p>
                            {group.instances.map((inst: any) => (
                                <div key={inst.id} className="flex items-center justify-between gap-4 p-3 rounded-lg bg-black/5 border border-white/5 hover:bg-black/10 transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "text-xs font-bold leading-none",
                                                inst.status === 'BROKEN' ? "text-destructive" : "text-green-500"
                                            )}>
                                                {inst.url}
                                            </span>
                                            <a href={inst.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                        </div>
                                        {inst.error && (
                                            <div className="mt-2 p-2 rounded bg-destructive/5 border border-destructive/10">
                                                <p className="text-[9px] font-black text-destructive/40 uppercase tracking-widest mb-1">Error Detail</p>
                                                <p className="text-[10px] font-mono text-destructive dark:text-destructive/80 leading-relaxed break-all">{inst.error}</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className={cn(
                                            "text-[10px] font-black px-2 py-0.5 rounded shadow-sm",
                                            inst.status === 'BROKEN' ? getStatusBadgeClass(inst.statusCode, true) : "bg-green-500/10 text-green-500"
                                        )}>
                                            {inst.statusCode || (inst.status === 'BROKEN' ? 'FAIL' : '200')}
                                        </span>
                                        {inst.status === 'BROKEN' && (
                                            <Button 
                                                variant="outline" 
                                                size="icon" 
                                                className="h-8 w-8 hover:bg-primary/10 hover:text-primary hover:border-primary/50" 
                                                onClick={(e) => { e.stopPropagation(); onRecheck(inst.id); }}
                                            >
                                                <RefreshCw className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
