'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Pause, Play, RefreshCw, ExternalLink, ChevronDown, ChevronRight, ChevronLeft, AlertCircle, CheckCircle2, Link2, Ghost, Globe, Search, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useSearchParams } from 'next/navigation';

export function ScanDashboard({ scanId, initialStatus }: { scanId: string, initialStatus: string }) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState(initialStatus);
  const triageContentRef = useRef<HTMLDivElement>(null);
  const [brokenPage, setBrokenPage] = useState(1);
  const [successPage, setSuccessPage] = useState(1);
  const [skippedPage, setSkippedPage] = useState(1);
  const [recheckedPage, setRecheckedPage] = useState(1);
  
  const initialSearch = searchParams.get('search') || '';
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [isSearching, setIsSearching] = useState(false);
  const [viewMode, setViewMode] = useState<'url' | 'source'>('url');
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

  const handleRecheck = async (linkId: string) => {
    const res = await fetch(`/api/links/${linkId}/recheck`, { method: 'POST' });
    if (res.ok) {
      fetchData();
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

  if (!data) return (
    <div className="flex items-center justify-center p-20">
      <RefreshCw className="h-10 w-10 animate-spin text-primary/50" />
    </div>
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
        return !l.parentUrl || targetUrls.some((t: string) => {
          const cleanT = t.trim().replace(/\/$/, '');
          const cleanP = l.parentUrl.replace(/\/$/, '');
          return cleanP === cleanT || cleanP.includes(cleanT);
        });
      }
      // In regular scans, show skipped links if their parent was internal
      const parent = l.parentUrl;
      if (!parent) return true;
      return isUrlInternal(parent);
    }

    if (isTargeted) {
      return targetUrls.some((t: string) => {
        const cleanT = t.trim().replace(/\/$/, '');
        const cleanL = l.url.replace(/\/$/, '');
        return cleanL === cleanT || cleanL.includes(cleanT);
      });
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

  // Discovery Logic: Which targets are MISSING?
  const missingTargets = isTargeted ? targetUrls.filter((t: string) => {
    const cleanT = t.trim().replace(/\/$/, '').toLowerCase();
    return !uniqueFilteredLinks.some(l => l.url.replace(/\/$/, '').toLowerCase() === cleanT);
  }) : [];

  const foundTargetCount = targetUrls.length - missingTargets.length;
  const coveragePercent = targetUrls.length > 0 ? (foundTargetCount / targetUrls.length) * 100 : 0;

  // Stats specific to the crawl progress (unfiltered)
  const pagesCrawled = links.filter((l: any) => l.type?.includes('html') && l.status !== 'PENDING').length;
  const globalPending = links.filter((l: any) => l.status === 'PENDING').length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header with Controls and Progress */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          {status !== 'COMPLETED' && (
            <Button 
              onClick={toggleStatus} 
              variant={status === 'RUNNING' ? 'secondary' : 'default'}
              className="w-32 shadow-lg"
            >
              {status === 'RUNNING' ? (
                <><Pause className="mr-2 h-4 w-4" /> Pause</>
              ) : (
                <><Play className="mr-2 h-4 w-4" /> Resume</>
              )}
            </Button>
          )}
          <div className="text-sm font-medium">
            <span className={status === 'RUNNING' ? 'text-green-500 animate-pulse' : status === 'COMPLETED' ? 'text-green-500' : 'text-yellow-500'}>
              ● {status.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="flex-1 max-w-md space-y-2">
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
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        {isTargeted ? (
            <>
                <StatCard title="Target Assets" value={targetUrls.length} icon={<Link2 className="h-4 w-4" />} color="text-primary" />
                <StatCard title="Pages Crawled" value={pagesCrawled} icon={<Globe className="h-4 w-4" />} />
                <StatCard title="Inst. Found" value={successCount} icon={<CheckCircle2 className="h-4 w-4" />} color="text-green-500" />
                <StatCard title="Missing Targets" value={brokenCount} icon={<AlertCircle className="h-4 w-4" />} color="text-red-500" />
                <StatCard title="Crawl Queue" value={globalPending} icon={<RefreshCw className={cn("h-4 w-4", status === 'RUNNING' && "animate-spin")} />} color="text-blue-500" />
            </>
        ) : (
            <>
                <StatCard title="Total Found" value={total} icon={<Link2 className="h-4 w-4" />} />
                <StatCard 
                    title="Checking" 
                    value={pending} 
                    icon={<RefreshCw className={cn("h-4 w-4", status === 'RUNNING' && "animate-spin")} />} 
                    color="text-blue-500" 
                />
                <StatCard title="Healthy" value={successCount} icon={<CheckCircle2 className="h-4 w-4" />} color="text-green-500" />
                <StatCard title="Broken" value={brokenCount} icon={<AlertCircle className="h-4 w-4" />} color="text-red-500" />
                <StatCard title="Skipped" value={skippedCount} icon={<Ghost className="h-4 w-4" />} color="text-slate-500" />
            </>
        )}
      </div>

      {/* Terminal and Triage */}
      <div className="flex flex-col gap-8 pb-20">
        {isTargeted && (
             <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex-1 space-y-2">
                    <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        Targeted Audit Active
                    </h3>
                    <p className="text-sm text-muted-foreground">Isolating reporting to your specific assets. We've found <strong>{foundTargetCount}</strong> of <strong>{targetUrls.length}</strong> targets so far.</p>
                    
                    <div className="w-full max-w-md h-1.5 bg-primary/10 rounded-full overflow-hidden">
                        <motion.div 
                            className="h-full bg-primary" 
                            initial={{ width: 0 }}
                            animate={{ width: `${coveragePercent}%` }}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-8 shrink-0">
                    <div className="text-center">
                        <div className="text-[10px] font-black opacity-50 uppercase tracking-widest leading-none mb-1">Found</div>
                        <div className="text-3xl font-black text-green-500 leading-none">{foundTargetCount}</div>
                    </div>
                    {missingTargets.length > 0 && (
                        <div className="text-center">
                            <div className="text-[10px] font-black opacity-50 uppercase tracking-widest leading-none mb-1">Missing</div>
                            <div className="text-3xl font-black text-red-500 leading-none">{missingTargets.length}</div>
                        </div>
                    )}
                    <div className="h-10 w-px bg-white/10 hidden md:block" />
                    <Button variant="glow" size="sm" onClick={downloadBacklinkCSV} className="h-10 px-4">
                        <ExternalLink className="mr-2 h-4 w-4" /> Export Backlinks
                    </Button>
                </div>
             </div>
        )}

        {isTargeted && missingTargets.length > 0 && (
            <Card className="border-red-500/20 bg-red-500/5">
                <CardHeader className="py-3">
                    <CardTitle className="text-sm font-bold uppercase tracking-widest text-red-500 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Missing / Orphaned Targets ({missingTargets.length})
                    </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 pt-0">
                    <p className="text-[11px] text-muted-foreground mb-3">The following requested URLs were not found after crawling the site. These assets are either unlinked or the crawler could not discover a path to them.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {missingTargets.map((t: string) => (
                            <div key={t} className="px-3 py-1.5 rounded bg-black/20 border border-white/5 text-[10px] font-mono text-red-400/80 break-all flex items-center justify-between group">
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
                <Tabs defaultValue={isTargeted ? (brokenCount > 0 ? "broken" : "success") : "broken"} className="flex flex-col h-full">
                    <CardHeader className="py-3 px-4 border-b sticky top-0 bg-background/80 backdrop-blur-md z-10">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                {isTargeted ? 'Audit Results' : 'Report Triage'}
                                {isSearching && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                            </CardTitle>
                            
                            <div className="flex items-center gap-4">
                                <div className="relative w-full md:w-64">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search URLs (min 3 chars)..."
                                        className="pl-9 h-9"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                
                                {!isTargeted && (
                                    <div className="flex border rounded-lg bg-muted/30 p-0.5">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className={cn("h-7 px-2 text-[10px] font-bold uppercase tracking-tight", viewMode === 'url' ? "bg-background shadow-sm" : "opacity-50")}
                                            onClick={() => setViewMode('url')}
                                        >
                                            By URL
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className={cn("h-7 px-2 text-[10px] font-bold uppercase tracking-tight", viewMode === 'source' ? "bg-background shadow-sm" : "opacity-50")}
                                            onClick={() => setViewMode('source')}
                                        >
                                            By Page
                                        </Button>
                                    </div>
                                )}

                                {!isTargeted && (
                                    <TabsList>
                                        <TabsTrigger value="broken" className="text-red-500 data-[state=active]:bg-red-500/10">
                                            Broken ({currentBrokenGroups.length})
                                        </TabsTrigger>
                                        <TabsTrigger value="rechecked" className="text-blue-500 data-[state=active]:bg-blue-500/10">
                                            Re-checked ({currentRecheckedGroups.length})
                                        </TabsTrigger>
                                        <TabsTrigger value="success">Success ({currentSuccessGroups.length})</TabsTrigger>
                                        <TabsTrigger value="skipped">Skipped ({currentSkippedGroups.length})</TabsTrigger>
                                    </TabsList>
                                )}
                            </div>

                            {isTargeted && (
                                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-1 rounded">
                                    LIVE AUDIT ACTIVE
                                </div>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent ref={triageContentRef} className="flex-1 overflow-auto p-0 flex flex-col">
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

        {/* Console info for targeted scans */}
        {isTargeted && status === 'RUNNING' && (
            <div className="p-4 bg-muted/50 rounded-lg border border-dashed border-primary/20 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <p className="text-[11px] text-muted-foreground italic">
                    The engine is currently traversing the site to discover all incoming links for your targets. 
                    Non-target links are being skipped in this view.
                </p>
            </div>
        )}

      </div>
    </div>
  );
}


function PaginationControls({ currentPage, totalItems, pageSize, onPageChange, position = 'bottom' }: any) {
    const totalPages = Math.ceil(totalItems / pageSize);
    if (totalPages <= 1) return null;

    return (
        <div className={cn(
            "flex items-center justify-between px-4 py-2 bg-muted/5",
            position === 'bottom' ? "border-t" : "border-b"
        )}>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                Page {currentPage} of {totalPages} <span className="ml-2 opacity-50">({totalItems} total)</span>
            </div>
            <div className="flex items-center gap-1">
                <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-7 w-7" 
                    disabled={currentPage === 1}
                    onClick={() => onPageChange(currentPage - 1)}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-7 w-7" 
                    disabled={currentPage === totalPages}
                    onClick={() => onPageChange(currentPage + 1)}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon, color = "" }: any) {
    return (
        <Card className="bg-card/50 backdrop-blur-sm shadow-md border-primary/10">
            <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between space-y-0 text-muted-foreground">
                <CardTitle className="text-[10px] font-bold uppercase tracking-widest">{title}</CardTitle>
                {icon}
            </CardHeader>
            <CardContent className="p-4 pt-1">
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
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

function TriageItemGeneral({ group, onRecheck }: any) {
    const [expanded, setExpanded] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const link = group;
    const isBroken = link.status === 'BROKEN';

    const visibleInstances = showAll ? group.instances : group.instances.slice(0, 10);

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
                "border-l-4 transition-colors overflow-hidden",
                isBroken ? "border-l-red-500 hover:bg-red-500/5" : "border-l-green-500 hover:bg-green-500/5"
            )}
        >
            <div className="h-12 px-4 flex items-center justify-between gap-4 cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                     {group.count > 1 && (
                        <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                            {group.count}
                        </span>
                    )}
                    <span className={cn(
                        "font-medium text-sm truncate",
                        isBroken ? "text-red-500" : "text-green-600 dark:text-green-400"
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
                        isBroken ? "bg-red-500 text-white" : "bg-green-500/10 text-green-500"
                    )}>
                        {link.statusCode || (isBroken ? 'FAIL' : '200 OK')}
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
                        <div className="p-4 space-y-4">
                            {link.error && isBroken && (
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-red-500/50 uppercase tracking-tight">Error:</p>
                                    <p className="text-[10px] font-mono bg-red-500/5 p-2 rounded border border-red-500/10 text-red-500">{link.error}</p>
                                </div>
                            )}
                            {visibleInstances.map((inst: any, i: number) => (
                                <div key={inst.id} className={cn("space-y-2", i > 0 && "pt-4 border-t border-dashed")}>
                                    <div className="flex flex-col gap-1">
                                        {inst.url !== link.url && (
                                            <div className="text-[10px] font-mono text-primary/80">
                                                Specific URL: {inst.url}
                                            </div>
                                        )}
                                        {inst.parentUrl && (
                                            <p className="text-xs text-muted-foreground flex items-center gap-2">
                                                <span className="font-bold shrink-0 opacity-50 uppercase tracking-tighter">Found on:</span>
                                                <a href={inst.parentUrl} target="_blank" rel="noreferrer" className="hover:underline break-all">
                                                    {inst.parentUrl}
                                                </a>
                                            </p>
                                        )}
                                    </div>
                                    {inst.snippet && (
                                        <div>
                                            <p className="text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-tight">HTML Snippet:</p>
                                            <pre className="text-[9px] font-mono bg-slate-900 text-slate-300 p-2 rounded-md overflow-x-auto border border-slate-800">
                                                {inst.snippet}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {group.instances.length > 10 && !showAll && (
                                <Button 
                                    variant="ghost" 
                                    className="w-full text-[10px] font-bold uppercase tracking-widest h-8 text-primary/60 hover:text-primary transition-colors hover:bg-primary/5"
                                    onClick={() => setShowAll(true)}
                                >
                                    Show all {group.count} occurrences
                                </Button>
                            )}
                        </div>
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

    const visibleInstances = showAll ? group.instances : group.instances.slice(0, 10);

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
                        className="font-medium text-sm text-red-500 hover:underline truncate"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {link.url}
                    </a>
                    <ExternalLink className="h-3 w-3 text-red-400/50 shrink-0" />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded">
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
                        <div className="p-4 space-y-4">
                            {link.error && (
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-red-500/50 uppercase tracking-tight">Error:</p>
                                    <p className="text-[10px] font-mono bg-red-500/5 p-2 rounded border border-red-500/10 text-red-500">{link.error}</p>
                                </div>
                            )}
                            {visibleInstances.map((inst: any, i: number) => (
                                <div key={inst.id} className={cn("space-y-2", i > 0 && "pt-4 border-t border-dashed")}>
                                    <div className="flex flex-col gap-1">
                                        {inst.url !== link.url && (
                                            <div className="text-[10px] font-mono text-red-400/80">
                                                Specific URL: {inst.url}
                                            </div>
                                        )}
                                        {inst.parentUrl && (
                                            <p className="text-xs text-muted-foreground flex items-center gap-2">
                                                <span className="font-bold shrink-0 uppercase tracking-tighter">Found on:</span>
                                                <a href={inst.parentUrl} target="_blank" rel="noreferrer" className="hover:underline break-all">
                                                    {inst.parentUrl}
                                                </a>
                                            </p>
                                        )}
                                    </div>
                                    {inst.snippet && (
                                        <div>
                                            <p className="text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-tight">HTML Snippet:</p>
                                            <pre className="text-[9px] font-mono bg-slate-900 text-slate-300 p-2 rounded-md overflow-x-auto border border-slate-800">
                                                {inst.snippet}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {group.instances.length > 10 && !showAll && (
                                <Button 
                                    variant="ghost" 
                                    className="w-full text-[10px] font-bold uppercase tracking-widest h-8 text-primary/60 hover:text-primary transition-colors hover:bg-primary/5"
                                    onClick={() => setShowAll(true)}
                                >
                                    Show all {group.count} occurrences
                                </Button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function TriageItemSuccess({ group }: any) {
    const link = group;

    return (
        <div className="border-l-4 border-l-green-500 hover:bg-green-500/5 transition-colors overflow-hidden">
            <div className="h-12 px-4 flex items-center justify-between gap-4 select-none">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-medium text-sm text-green-600 dark:text-green-400 truncate">{link.url}</span>
                    <a 
                        href={link.url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-muted-foreground/40 hover:text-primary shrink-0 transition-colors"
                        title="Open in new tab"
                    >
                        <ExternalLink className="h-3 w-3" />
                    </a>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className="bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded-sm font-bold text-[10px]">{link.statusCode || 200} OK</span>
                </div>
            </div>
        </div>
    );
}

function TriageItemSkipped({ group }: any) {
    const [expanded, setExpanded] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const link = group;

    const visibleInstances = showAll ? group.instances : group.instances.slice(0, 10);

    return (
        <div className="hover:bg-muted/10 transition-colors border-l-4 border-l-transparent overflow-hidden">
             <div className="h-12 px-4 flex items-center justify-between gap-4 cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {group.count > 1 && (
                        <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                            {group.count}
                        </span>
                    )}
                    <span className="font-medium text-slate-400 text-sm truncate">{link.url}</span>
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
                        <div className="p-3 space-y-2">
                             {visibleInstances.map((inst: any, i: number) => (
                                <div key={inst.id} className={cn("flex flex-col gap-1", i > 0 && "pt-2 border-t border-dashed")}>
                                    <div className="flex flex-col gap-1">
                                         {inst.snippet?.startsWith('[') && (
                                            <span className="text-[10px] text-primary/80 font-mono italic">
                                                {inst.snippet.split(']')[0] + ']'}
                                            </span>
                                        )}
                                         {inst.error && (
                                            <div className="text-[10px] font-bold text-amber-500/80 bg-amber-500/5 px-2 py-1 rounded border border-amber-500/10 mb-1">
                                                Reason: {inst.error}
                                            </div>
                                        )}
                                         {inst.url !== link.url && (
                                            <div className="text-[10px] font-mono text-slate-500/80">
                                                Specific URL: {inst.url}
                                            </div>
                                        )}
                                        <span className="text-[10px] opacity-100 break-all text-muted-foreground/50">From: {inst.parentUrl || 'Start'}</span>
                                    </div>
                                </div>
                            ))}
                            {group.instances.length > 10 && !showAll && (
                                <Button 
                                    variant="ghost" 
                                    className="w-full text-[10px] font-bold uppercase tracking-widest h-8 text-primary/60 hover:text-primary transition-colors hover:bg-primary/5"
                                    onClick={() => setShowAll(true)}
                                >
                                    Show all {group.count} occurrences
                                </Button>
                            )}
                        </div>
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

    const visibleInstances = showAll ? group.instances : group.instances.slice(0, 10);

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
                "border-l-4 transition-colors overflow-hidden",
                isBroken ? "border-l-red-500 hover:bg-red-500/5 text-slate-800 dark:text-slate-200" : 
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
                            "font-medium text-sm truncate hover:underline",
                            isBroken ? "text-red-500" : isSuccess ? "text-green-600 dark:text-green-400" : "text-blue-500"
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {link.url}
                    </a>
                    <ExternalLink className={cn("h-3 w-3 shrink-0", isBroken ? "text-red-400/50" : "text-muted-foreground/40")} />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter",
                        isPending ? "bg-blue-500 text-white flex items-center gap-1" :
                        isBroken ? "bg-red-500 text-white" : "bg-green-500/10 text-green-500"
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
                        <div className="p-4 space-y-4">
                            {link.error && isBroken && (
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-red-500/50 uppercase tracking-tight">Error:</p>
                                    <p className="text-[10px] font-mono bg-red-500/5 p-2 rounded border border-red-500/10 text-red-500">{link.error}</p>
                                </div>
                            )}
                            {visibleInstances.map((inst: any, i: number) => (
                                <div key={inst.id} className={cn("space-y-2", i > 0 && "pt-4 border-t border-dashed")}>
                                    <div className="flex flex-col gap-1">
                                        {inst.url !== link.url && (
                                            <div className={cn("text-[10px] font-mono", isBroken ? "text-red-400/80" : "text-muted-foreground")}>
                                                Specific URL: {inst.url}
                                            </div>
                                        )}
                                        {inst.parentUrl && (
                                            <p className="text-xs text-muted-foreground flex items-center gap-2">
                                                <span className="font-bold shrink-0 uppercase tracking-tighter opacity-50">Found on:</span>
                                                <a href={inst.parentUrl} target="_blank" rel="noreferrer" className="hover:underline break-all">
                                                    {inst.parentUrl}
                                                </a>
                                            </p>
                                        )}
                                    </div>
                                    {inst.snippet && (
                                        <div>
                                            <p className="text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-tight">HTML Snippet:</p>
                                            <pre className="text-[9px] font-mono bg-slate-900 text-slate-300 p-2 rounded-md overflow-x-auto border border-slate-800">
                                                {inst.snippet}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {group.instances.length > 10 && !showAll && (
                                <Button 
                                    variant="ghost" 
                                    className="w-full text-[10px] font-bold uppercase tracking-widest h-8 text-primary/60 hover:text-primary transition-colors hover:bg-primary/5"
                                    onClick={() => setShowAll(true)}
                                >
                                    Show all {group.count} occurrences
                                </Button>
                            )}
                        </div>
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
                hasBroken ? "border-l-red-500 hover:bg-red-500/5 shadow-[inset_4px_0_0_rgba(239,68,68,0.2)]" : "border-l-green-500 hover:bg-green-500/5"
            )}
        >
            <div className="h-12 px-4 flex items-center justify-between gap-4 cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                        {group.count} {group.count === 1 ? 'link' : 'links'}
                    </span>
                    <span className={cn(
                        "font-medium text-sm truncate",
                        hasBroken ? "text-red-500" : "text-green-600 dark:text-green-400"
                    )}>
                        {group.url}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                     <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter",
                        hasBroken ? "bg-red-500 text-white shadow-sm" : "bg-green-500/10 text-green-500"
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
                                                inst.status === 'BROKEN' ? "text-red-500" : "text-green-500"
                                            )}>
                                                {inst.url}
                                            </span>
                                            <a href={inst.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                        </div>
                                        {inst.error && <p className="text-[10px] font-mono text-red-400/80 mt-1.5 leading-relaxed break-all">{inst.error}</p>}
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className={cn(
                                            "text-[10px] font-black px-2 py-0.5 rounded shadow-sm",
                                            inst.status === 'BROKEN' ? "bg-red-500 text-white" : "bg-green-500/10 text-green-500"
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
