'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Pause, Play, RefreshCw, ExternalLink, ChevronDown, ChevronRight, ChevronLeft, Terminal, AlertCircle, CheckCircle2, Link2, Ghost, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ScanDashboard({ scanId, initialStatus }: { scanId: string, initialStatus: string }) {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState(initialStatus);
  const [showTerminal, setShowTerminal] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const triageContentRef = useRef<HTMLDivElement>(null);
  const [brokenPage, setBrokenPage] = useState(1);
  const [successPage, setSuccessPage] = useState(1);
  const [skippedPage, setSkippedPage] = useState(1);
  const [recheckedPage, setRecheckedPage] = useState(1);
  const pageSize = 30;

  const fetchData = async () => {
    const res = await fetch(`/api/scans/${scanId}`);
    if (res.ok) {
      const json = await res.json();
      setData(json);
      setStatus(json.scan.status);
      
      // Update logs: get last 20 checked links
      const checkedLinks = [...json.links]
        .filter(l => l.status !== 'PENDING' && l.status !== 'SKIPPED')
        .sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime())
        .slice(0, 20);
      
      const newLogs = checkedLinks.map(l => 
        `[${new Date(l.checkedAt).toLocaleTimeString()}] ${l.status === 'SUCCESS' ? '✓' : '✗'} ${l.url} (${l.statusCode || 'ERROR'})`
      );
      setLogs(newLogs.reverse());
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [scanId]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [logs, showTerminal]);

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

  if (!data) return (
    <div className="flex items-center justify-center p-20">
      <RefreshCw className="h-10 w-10 animate-spin text-primary/50" />
    </div>
  );

  const { links, scan } = data;
  
  // Parse config for targeted scan info
  let config: any = {};
  try {
    config = typeof scan.config === 'string' ? JSON.parse(scan.config) : scan.config;
  } catch (e) {}
  
  const isTargeted = !!config.isTargeted && (config.targetUrls?.length > 0);
  const targetUrls = config.targetUrls || [];

  // Filter links if targeted
  const filteredLinks = isTargeted 
    ? links.filter((l: any) => targetUrls.some((t: string) => {
        const cleanT = t.trim().replace(/\/$/, '');
        const cleanL = l.url.replace(/\/$/, '');
        return cleanL === cleanT || cleanL.includes(cleanT);
      }))
    : links;

  const total = filteredLinks.length;
  const pending = filteredLinks.filter((l: any) => l.status === 'PENDING').length;
  // Raw counts for internal use if needed, but UI uses unique counts derived below
  
  const progress = links.length > 0 ? ((links.length - links.filter((l: any) => l.status === 'PENDING').length) / links.length) * 100 : 0;

  const brokenLinksRaw = filteredLinks.filter((l: any) => l.status === 'BROKEN');
  const successLinksRaw = filteredLinks.filter((l: any) => l.status === 'SUCCESS' && !l.isRechecked);
  const skippedLinksRaw = filteredLinks.filter((l: any) => l.status === 'SKIPPED' && !l.isRechecked);
  const recheckedLinksRaw = filteredLinks.filter((l: any) => l.isRechecked);

  const groupLinks = (links: any[]) => {
    const grouped: Record<string, any[]> = {};
    links.forEach(link => {
        // Protocol-insensitive grouping
        const normalizedUrl = link.url.replace(/^https?:\/\//, '').toLowerCase();
        if (!grouped[normalizedUrl]) {
            grouped[normalizedUrl] = [];
        }
        grouped[normalizedUrl].push(link);
    });
    return Object.entries(grouped).map(([normalizedKey, instances]) => {
        // Prioritize https version if available for the display URL
        const displayUrl = instances.find(inst => inst.url.startsWith('https'))?.url || instances[0].url;
        return {
            url: displayUrl,
            normalizedKey,
            instances,
            ...instances[0], // status, statusCode, etc. from first instance
            count: instances.length
        };
    });
  };

  const brokenLinks = groupLinks(brokenLinksRaw);
  const successLinks = groupLinks(successLinksRaw);
  const skippedLinks = groupLinks(skippedLinksRaw);

  const brokenCount = brokenLinks.length;
  const successCount = successLinks.length;
  const skippedCount = skippedLinks.length;
  const recheckedLinks = groupLinks(recheckedLinksRaw);
  const recheckedCount = recheckedLinks.length;

  const paginatedBroken = brokenLinks.slice((brokenPage - 1) * pageSize, brokenPage * pageSize);
  const paginatedSuccess = successLinks.slice((successPage - 1) * pageSize, successPage * pageSize);
  const paginatedSkipped = skippedLinks.slice((skippedPage - 1) * pageSize, skippedPage * pageSize);
  const paginatedRechecked = recheckedLinks.slice((recheckedPage - 1) * pageSize, recheckedPage * pageSize);

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
             <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        Targeted Audit Active
                    </h3>
                    <p className="text-sm text-muted-foreground">This report is filtered to show ONLY the specific assets you requested.</p>
                </div>
                <div className="flex gap-8">
                    <div className="text-center">
                        <div className="text-sm font-bold opacity-50 uppercase tracking-tighter">Your targets</div>
                        <div className="text-3xl font-black">{targetUrls.length}</div>
                    </div>
                    <div className="text-center">
                        <div className="text-sm font-bold opacity-50 uppercase tracking-tighter">Total Results</div>
                        <div className="text-3xl font-black text-green-500">{successCount}</div>
                    </div>
                </div>
             </div>
        )}

        {/* Triage Section (Now at the top) */}
        <div className="w-full order-1">
            <Card className="min-h-[500px] flex flex-col shadow-xl border-primary/5">
                <Tabs defaultValue={isTargeted ? (brokenCount > 0 ? "broken" : "success") : "broken"} className="flex flex-col h-full">
                    <CardHeader className="py-3 px-4 border-b sticky top-0 bg-background/80 backdrop-blur-md z-10">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">{isTargeted ? 'Audit Results' : 'Report Triage'}</CardTitle>
                            {!isTargeted && (
                                <TabsList>
                                    <TabsTrigger value="broken" className="text-red-500 data-[state=active]:bg-red-500/10">Broken ({brokenCount})</TabsTrigger>
                                    <TabsTrigger value="rechecked" className="text-blue-500 data-[state=active]:bg-blue-500/10">Re-checked ({recheckedCount})</TabsTrigger>
                                    <TabsTrigger value="success">Success ({successCount})</TabsTrigger>
                                    <TabsTrigger value="skipped">Skipped ({skippedCount})</TabsTrigger>
                                </TabsList>
                            )}
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
                                        totalItems={brokenLinks.length} 
                                        pageSize={pageSize} 
                                        onPageChange={setBrokenPage} 
                                        position="top"
                                    />
                                    <div className="divide-y flex-1">
                                        {paginatedBroken.map((group: any) => (
                                            <TriageItem key={group.url} group={group} onRecheck={handleRecheck} />
                                        ))}
                                    </div>
                                    <PaginationControls 
                                        currentPage={brokenPage} 
                                        totalItems={brokenLinks.length} 
                                        pageSize={pageSize} 
                                        onPageChange={setBrokenPage} 
                                        position="bottom"
                                    />
                                </>
                            )}
                        </TabsContent>
                        <TabsContent value="rechecked" className="m-0 flex-1 flex flex-col">
                             <div className="divide-y text-xs text-muted-foreground/60 flex-1">
                                {recheckedLinks.length === 0 ? (
                                    <div className="p-12 text-center text-sm italic text-muted-foreground">
                                        No links have been manually re-checked yet.
                                    </div>
                                ) : (
                                    <>
                                        {recheckedLinks.length > pageSize && (
                                            <PaginationControls 
                                                currentPage={recheckedPage} 
                                                totalItems={recheckedLinks.length} 
                                                pageSize={pageSize} 
                                                onPageChange={setRecheckedPage} 
                                                position="top"
                                            />
                                        )}
                                        {paginatedRechecked.map((group: any) => (
                                            <TriageItemRechecked key={group.url} group={group} onRecheck={handleRecheck} />
                                        ))}
                                        {recheckedLinks.length > pageSize && (
                                            <PaginationControls 
                                                currentPage={recheckedPage} 
                                                totalItems={recheckedLinks.length} 
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
                                {successLinks.length > pageSize && (
                                    <PaginationControls 
                                        currentPage={successPage} 
                                        totalItems={successLinks.length} 
                                        pageSize={pageSize} 
                                        onPageChange={setSuccessPage} 
                                        position="top"
                                    />
                                )}
                                {paginatedSuccess.map((group: any) => (
                                    <TriageItemSuccess key={group.url} group={group} />
                                ))}
                             </div>
                             {successLinks.length > pageSize && (
                                <PaginationControls 
                                    currentPage={successPage} 
                                    totalItems={successLinks.length} 
                                    pageSize={pageSize} 
                                    onPageChange={setSuccessPage} 
                                    position="bottom"
                                />
                             )}
                        </TabsContent>
                        <TabsContent value="skipped" className="m-0 flex-1 flex flex-col">
                             <div className="divide-y text-xs text-muted-foreground/60 flex-1">
                                {skippedLinks.length > pageSize && (
                                    <PaginationControls 
                                        currentPage={skippedPage} 
                                        totalItems={skippedLinks.length} 
                                        pageSize={pageSize} 
                                        onPageChange={setSkippedPage} 
                                        position="top"
                                    />
                                )}
                                {paginatedSkipped.map((group: any) => (
                                    <TriageItemSkipped key={group.url} group={group} />
                                ))}
                                {skippedLinks.length === 0 && (
                                    <div className="p-12 text-center text-sm italic text-muted-foreground">
                                        No links skipped.
                                    </div>
                                )}
                             </div>
                             {skippedLinks.length > pageSize && (
                                <PaginationControls 
                                    currentPage={skippedPage} 
                                    totalItems={skippedLinks.length} 
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

        {/* Terminal Section (Now at the bottom and collapsible) */}
        {status !== 'COMPLETED' && (
            <div className="w-full order-2">
                <Card className="flex flex-col bg-slate-950 border-slate-800 text-slate-300 font-mono shadow-2xl overflow-hidden transition-all duration-300">
                    <CardHeader className="py-3 px-4 border-b border-slate-800 flex flex-row items-center justify-between space-y-0 cursor-pointer hover:bg-slate-900/50" onClick={() => setShowTerminal(!showTerminal)}>
                        <CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                            <Terminal className="h-3 w-3" />
                            Live Console
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] text-slate-500 mr-2">
                                <div className={cn("w-1.5 h-1.5 rounded-full", status === 'RUNNING' ? "bg-emerald-500 animate-pulse" : "bg-slate-600")} />
                                {status === 'RUNNING' ? 'STREAMING' : 'READY'}
                            </div>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500">
                                 {showTerminal ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                        </div>
                    </CardHeader>
                    <AnimatePresence initial={false}>
                        {showTerminal && (
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: "auto" }}
                                exit={{ height: 0 }}
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                            >
                                <CardContent 
                                    ref={scrollAreaRef}
                                    className="h-[400px] overflow-auto p-4 text-[11px] leading-relaxed space-y-1 custom-scrollbar"
                                >
                                    {logs.length === 0 ? (
                                        <p className="text-slate-600 italic">Initializing engine...</p>
                                    ) : (
                                        logs.map((log, i) => (
                                            <div key={i} className={cn("flex gap-3", log.includes('✗') ? 'text-red-400' : 'text-emerald-400')}>
                                                <span className="opacity-30 flex-shrink-0 select-none">{(i + 1).toString().padStart(3, '0')}</span>
                                                <span>{log}</span>
                                            </div>
                                        ))
                                    )}
                                </CardContent>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Card>
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
                "border-l-4 transition-colors",
                isBroken ? "border-l-red-500 hover:bg-red-500/5" : "border-l-green-500 hover:bg-green-500/5"
            )}
        >
            <div className="p-4 flex items-start justify-between gap-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
                <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                         {group.count > 1 && (
                            <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                                {group.count} PLACES
                            </span>
                        )}
                        <span className={cn(
                            "font-medium text-sm break-all",
                            isBroken ? "text-red-500" : "text-green-600 dark:text-green-400"
                        )}>
                            {link.url}
                        </span>
                        <a 
                            href={link.url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-muted-foreground hover:text-primary shrink-0"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ExternalLink className="h-3 w-3" />
                        </a>
                    </div>
                    {link.error && isBroken && <p className="text-[10px] font-mono bg-destructive/5 p-2 rounded border border-destructive/20 text-destructive">{link.error}</p>}
                </div>
                <div className="flex items-center gap-4 shrink-0">
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
            className="border-l-4 border-l-red-500 hover:bg-muted/30 transition-colors"
        >
            <div className="p-4 flex items-start justify-between gap-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
                <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        {group.count > 1 && (
                            <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                                {group.count} PLACES
                            </span>
                        )}
                        <a 
                            href={link.url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="font-medium text-sm text-red-500 hover:underline break-all"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {link.url}
                        </a>
                        <ExternalLink className="h-3 w-3 text-red-400 shrink-0" />
                    </div>
                    {link.error && <p className="text-[10px] font-mono bg-destructive/5 p-2 rounded border border-destructive/20 text-destructive">{link.error}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                         <span className="text-xs font-bold bg-red-500 text-white px-2 py-1 rounded">
                            {link.statusCode || 'FAIL'}
                        </span>
                        {expanded ? <ChevronDown className="h-4 w-4 opacity-50" /> : <ChevronRight className="h-4 w-4 opacity-50" />}
                    </div>
                    <Button variant="outline" size="sm" className="h-8 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); onRecheck(link.id); }}>
                        <RefreshCw className="mr-1 h-3 w-3" /> RE-CHECK
                    </Button>
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
    const [expanded, setExpanded] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const link = group;

    const visibleInstances = showAll ? group.instances : group.instances.slice(0, 10);

    return (
        <div className="border-l-4 border-l-green-500 hover:bg-muted/10 transition-colors">
            <div className="p-4 flex items-start justify-between gap-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
                <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                        {group.count > 1 && (
                            <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                                {group.count} PLACES
                            </span>
                        )}
                        <span className="font-medium text-sm text-green-600 dark:text-green-400 break-all">{link.url}</span>
                        <a 
                            href={link.url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-muted-foreground hover:text-primary shrink-0"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ExternalLink className="h-3 w-3" />
                        </a>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded-sm font-bold text-[10px]">{link.statusCode || 200} OK</span>
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
                        <div className="p-4 space-y-2">
                             {visibleInstances.map((inst: any, i: number) => (
                                <div key={inst.id} className={cn("flex flex-col gap-1", i > 0 && "pt-2 border-t border-dashed")}>
                                    <div className="flex flex-col gap-1">
                                         {inst.url !== link.url && (
                                            <div className="text-[10px] font-mono text-green-500/80">
                                                Specific URL: {inst.url}
                                            </div>
                                        )}
                                        {inst.parentUrl && (
                                            <p className="text-[10px] text-muted-foreground flex items-center gap-2">
                                                <span className="font-bold opacity-50 shrink-0 uppercase tracking-tighter">Linked from:</span>
                                                <a href={inst.parentUrl} target="_blank" rel="noreferrer" className="hover:underline break-all">
                                                    {inst.parentUrl}
                                                </a>
                                            </p>
                                        )}
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

function TriageItemSkipped({ group }: any) {
    const [expanded, setExpanded] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const link = group;

    const visibleInstances = showAll ? group.instances : group.instances.slice(0, 10);

    return (
        <div className="hover:bg-muted/10 transition-colors">
             <div className="p-3 flex items-center justify-between gap-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        {group.count > 1 && (
                            <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                                {group.count} PLACES
                            </span>
                        )}
                        <span className="font-medium text-slate-400 break-all">{link.url}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="bg-slate-500/10 text-slate-500 px-1.5 py-0.5 rounded-sm text-[10px] uppercase font-bold tracking-tighter">Skipped</span>
                    <a 
                        href={link.url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-muted-foreground hover:text-primary"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <ExternalLink className="h-3 w-3" />
                    </a>
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
                "border-l-4 transition-colors",
                isBroken ? "border-l-red-500 hover:bg-red-500/5 text-slate-800 dark:text-slate-200" : 
                isSuccess ? "border-l-green-500 hover:bg-green-500/5" :
                "border-l-blue-500 hover:bg-blue-500/5"
            )}
        >
            <div className="p-4 flex items-start justify-between gap-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
                <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        {group.count > 1 && (
                            <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                                {group.count} PLACES
                            </span>
                        )}
                        <a 
                            href={link.url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className={cn(
                                "font-medium text-sm break-all hover:underline",
                                isBroken ? "text-red-500" : isSuccess ? "text-green-600 dark:text-green-400" : "text-blue-500"
                            )}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {link.url}
                        </a>
                        <ExternalLink className={cn("h-3 w-3 shrink-0", isBroken ? "text-red-400" : "text-muted-foreground")} />
                    </div>
                    {link.error && isBroken && <p className="text-[10px] font-mono bg-destructive/5 p-2 rounded border border-destructive/20 text-destructive">{link.error}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                         <span className={cn(
                             "text-[10px] font-bold px-2 py-1 rounded uppercase tracking-tighter",
                             isPending ? "bg-blue-500 text-white flex items-center gap-1" :
                             isBroken ? "bg-red-500 text-white" : "bg-green-500/10 text-green-500"
                         )}>
                            {isPending && <RefreshCw className="h-3 w-3 animate-spin inline mr-1" />}
                            {isPending ? 'CHECKING' : link.statusCode || (isBroken ? 'FAIL' : '200 OK')}
                        </span>
                        {expanded ? <ChevronDown className="h-4 w-4 opacity-50" /> : <ChevronRight className="h-4 w-4 opacity-50" />}
                    </div>
                    <Button variant="outline" size="sm" className="h-8 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); onRecheck(link.id); }} disabled={isPending}>
                        <RefreshCw className={cn("mr-1 h-3 w-3", isPending && "animate-spin")} /> RE-CHECK
                    </Button>
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

