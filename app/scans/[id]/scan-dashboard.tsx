'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Pause, Play, RefreshCw, ExternalLink, ChevronDown, ChevronRight, ChevronLeft, Terminal, AlertCircle, CheckCircle2, Link2, Ghost } from 'lucide-react';
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
  const pageSize = 30;

  const fetchData = async () => {
    const res = await fetch(`/api/scans/${scanId}`);
    if (res.ok) {
      const json = await res.json();
      setData(json);
      setStatus(json.scan.status);
      
      // Update logs: get last 20 checked links
      const checkedLinks = [...json.links]
        .filter(l => l.status !== 'PENDING')
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
  }, [brokenPage, successPage, skippedPage]);

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

  const { links } = data;
  const total = links.length;
  const pending = links.filter((l: any) => l.status === 'PENDING').length;
  const successCount = links.filter((l: any) => l.status === 'SUCCESS').length;
  const brokenCount = links.filter((l: any) => l.status === 'BROKEN').length;
  const skippedCount = links.filter((l: any) => l.status === 'SKIPPED').length;
  
  const progress = total > 0 ? ((total - pending) / total) * 100 : 0;

  const brokenLinks = links.filter((l: any) => l.status === 'BROKEN');
  const successLinks = links.filter((l: any) => l.status === 'SUCCESS');
  const skippedLinks = links.filter((l: any) => l.status === 'SKIPPED');

  const paginatedBroken = brokenLinks.slice((brokenPage - 1) * pageSize, brokenPage * pageSize);
  const paginatedSuccess = successLinks.slice((successPage - 1) * pageSize, successPage * pageSize);
  const paginatedSkipped = skippedLinks.slice((skippedPage - 1) * pageSize, skippedPage * pageSize);

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
                <span>Overall Progress</span>
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
      </div>

      {/* Terminal and Triage */}
      <div className="flex flex-col gap-8 pb-20">
        {/* Triage Section (Now at the top) */}
        <div className="w-full order-1">
            <Card className="min-h-[500px] flex flex-col shadow-xl border-primary/5">
                <Tabs defaultValue="broken" className="flex flex-col h-full">
                    <CardHeader className="py-3 px-4 border-b sticky top-0 bg-background/80 backdrop-blur-md z-10">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">Report Triage</CardTitle>
                            <TabsList>
                                <TabsTrigger value="broken" className="text-red-500 data-[state=active]:bg-red-500/10">Broken ({brokenCount})</TabsTrigger>
                                <TabsTrigger value="success">Success ({successCount})</TabsTrigger>
                                <TabsTrigger value="skipped">Skipped ({skippedCount})</TabsTrigger>
                            </TabsList>
                        </div>
                    </CardHeader>
                    <CardContent ref={triageContentRef} className="flex-1 overflow-auto p-0 flex flex-col">
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
                                        {paginatedBroken.map((link: any) => (
                                            <TriageItem key={link.id} link={link} onRecheck={handleRecheck} />
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
                                {paginatedSuccess.map((link: any) => (
                                    <div key={link.id} className="p-3 flex items-center justify-between hover:bg-muted/10 transition-colors">
                                        <span className="truncate max-w-md">{link.url}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded-sm">{link.statusCode || 200} OK</span>
                                            <a href={link.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                                                <ExternalLink className="h-3 w-3" />
                                            </a>
                                        </div>
                                    </div>
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
                                {paginatedSkipped.map((link: any) => (
                                    <div key={link.id} className="p-3 flex items-center justify-between hover:bg-muted/10 transition-colors">
                                        <div className="flex flex-col gap-0.5 min-w-0">
                                            <span className="truncate max-w-md font-medium text-slate-400">{link.url}</span>
                                            <span className="text-[10px] opacity-50 truncate max-w-sm">From: {link.parentUrl || 'Start'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="bg-slate-500/10 text-slate-500 px-1.5 py-0.5 rounded-sm text-[10px] uppercase font-bold tracking-tighter">Skipped</span>
                                            <a href={link.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                                                <ExternalLink className="h-3 w-3" />
                                            </a>
                                        </div>
                                    </div>
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
                    </CardContent>
                </Tabs>
            </Card>
        </div>

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

function TriageItem({ link, onRecheck }: any) {
    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 border-l-4 border-l-red-500 hover:bg-muted/50 transition-colors"
        >
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <a href={link.url} target="_blank" rel="noreferrer" className="font-medium text-sm text-red-500 hover:underline truncate">
                            {link.url}
                        </a>
                        <ExternalLink className="h-3 w-3 text-red-400 shrink-0" />
                    </div>
                    {link.parentUrl && (
                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                            <span className="font-bold">PARENT:</span>
                            <a href={link.parentUrl} target="_blank" rel="noreferrer" className="hover:underline truncate">
                                {link.parentUrl}
                            </a>
                        </p>
                    )}
                    {link.error && <p className="text-[10px] font-mono bg-destructive/5 p-2 rounded border border-destructive/20 text-destructive">{link.error}</p>}
                    {link.snippet && (
                        <div className="mt-2">
                             <p className="text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-tight">HTML Snippet:</p>
                             <pre className="text-[9px] font-mono bg-slate-900 text-slate-300 p-2 rounded-md overflow-x-auto border border-slate-800">
                                {link.snippet}
                             </pre>
                        </div>
                    )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-xs font-bold bg-red-500 text-white px-2 py-1 rounded">
                        {link.statusCode || 'FAIL'}
                    </span>
                    <Button variant="outline" size="sm" className="h-8 text-[10px] px-2" onClick={() => onRecheck(link.id)}>
                        <RefreshCw className="mr-1 h-3 w-3" /> RE-CHECK
                    </Button>
                </div>
            </div>
        </motion.div>
    );
}
