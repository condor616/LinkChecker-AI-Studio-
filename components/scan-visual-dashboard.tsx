'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { isTargetUrlMatch, isTargetedScanConfig } from '@/lib/utils/url';
import { useRouter } from 'next/navigation';
import { 
  AlertCircle, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft,
  ExternalLink, 
  Globe, 
  ArrowLeft,
  LayoutDashboard,
  BarChart3,
  PieChart as PieChartIcon,
  AlertTriangle,
  Zap,
  TrendingDown,
  Activity,
  Ghost
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

interface ScanVisualDashboardProps {
  scanId: string;
  initialData?: any;
}

export function ScanVisualDashboard({ scanId, initialData }: ScanVisualDashboardProps) {
  const router = useRouter();
  const [data, setData] = useState<any>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [priorityPage, setPriorityPage] = useState(1);
  const priorityPageSize = 5;
  const isTargetedScan = isTargetedScanConfig(data?.scan?.config);

  const fetchData = async () => {
    const res = await fetch(`/api/scans/${scanId}`);
    if (res.ok) {
      const json = await res.json();
      setData(json);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isTargetedScan) {
      router.replace(`/scans/${scanId}`);
    }
  }, [isTargetedScan, scanId, router]);

  useEffect(() => {
    if (isTargetedScan) return;
    if (!initialData) {
      fetchData();
    }
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [scanId, initialData, isTargetedScan]);

  const stats = useMemo(() => {
    if (!data || isTargetedScan) return null;
    const { links, scan } = data;

    // 1. Parse config for filtering
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

    // 2. Filter links:
    // - If targeted: only targets.
    // - Regular: Only links found ON internal pages (or the start URL itself).
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
        return matchesTarget(l.url);
      }
      
      // Regular scan: Only show if the link exists on an internal page (or is the entry point)
      const parent = l.parentUrl;
      if (!parent) return true; // Entry point
      return isUrlInternal(parent);
    });

    const total = filteredLinks.length;
    const brokenLinks = filteredLinks.filter((l: any) => l.status === 'BROKEN');
    const broken = brokenLinks.length;
    const success = filteredLinks.filter((l: any) => l.status === 'SUCCESS' && !l.isRechecked).length;
    const pending = filteredLinks.filter((l: any) => l.status === 'PENDING').length;
    const skipped = filteredLinks.filter((l: any) => l.status === 'SKIPPED').length;
    
    // Refined Health Score Algorithm (Using filtered links)
    let totalPenalty = 0;

    brokenLinks.forEach((l: any) => {
      // 1. Base penalty by status code
      let penalty = 1.0;
      const code = parseInt(l.statusCode || '0');
      if (code >= 500) penalty = 2.0;
      else if (code >= 400) penalty = 1.2;
      else if (l.error?.toLowerCase().includes('timeout')) penalty = 1.5;

      // 2. Origin multiplier
      let isInternal = false;
      try {
        isInternal = new URL(l.url).hostname === internalDomain || l.url.startsWith('/');
      } catch (e) {}
      
      const originMultiplier = isInternal ? 2.0 : 0.8;

      totalPenalty += (penalty * originMultiplier);
    });

    const sensitivity = 10.0; 
    const healthValue = total > 0 
      ? Math.max(0, 100 - (totalPenalty / total) * 100 * sensitivity) 
      : 100;
    
    const finalHealth = broken > 0 ? Math.min(99, Math.round(healthValue)) : 100;

    // Group by parent page for prioritized fix list (normalizing URLs to avoid duplication)
    const brokenByPage: Record<string, { count: number, originalUrl: string }> = {};
    brokenLinks.forEach((l: any) => {
      const parent = l.parentUrl || startUrl || 'Direct Entry';
      // Normalize: lowercase, strip protocol, strip www., strip trailing slash
      const normalized = parent.toLowerCase()
        .replace(/^https?:\/\/(www\.)?/, '')
        .replace(/\/$/, '');
        
      if (!brokenByPage[normalized]) {
        brokenByPage[normalized] = { count: 0, originalUrl: parent };
      }
      brokenByPage[normalized].count++;
    });

    const topPagesToFix = Object.values(brokenByPage)
      .sort((a, b) => b.count - a.count)
      .map(({ originalUrl, count }) => ({ url: originalUrl, count }));

    return {
      total,
      broken,
      success,
      pending,
      skipped,
      topPagesToFix,
      health: finalHealth
    };
  }, [data, isTargetedScan]);

  if (isTargetedScan) {
    return null;
  }

  if (loading || !data || !stats) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <Activity className="h-10 w-10 animate-spin text-primary/50" />
        <p className="text-sm text-muted-foreground animate-pulse">Analyzing scan data...</p>
      </div>
    );
  }

  const { scan } = data;

  return (
    <div className="space-y-10 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <Link href={`/scans/${scanId}`} className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors group mb-2">
            <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Back to Scan Report
          </Link>
          <div className="flex items-center gap-3">
             <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                <LayoutDashboard className="h-6 w-6 text-primary" />
             </div>
             <div>
                <h1 className="text-3xl font-black tracking-tight text-foreground">{scan.name} Dashboard</h1>
                <p className="text-muted-foreground text-sm">Visual analysis of your site's health and issues.</p>
             </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           <Badge variant={scan.status === 'COMPLETED' ? 'secondary' : 'outline'} className={cn(
             "px-4 py-1.5 text-xs font-black uppercase tracking-widest border-2",
             scan.status === 'RUNNING' && "animate-pulse border-blue-500/50 text-blue-400 bg-blue-500/10",
             scan.status === 'COMPLETED' && "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
           )}>
             {scan.status}
           </Badge>
        </div>
      </div>

      {/* Top Row: Stats & Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Health Shield */}
        <Card className="lg:col-span-1 bg-card border-primary/10 overflow-hidden relative group shadow-2xl">
           <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <CheckCircle2 className="h-40 w-40 text-primary rotate-12" />
           </div>
           <CardHeader>
              <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <ShieldCheckIcon className="h-3.5 w-3.5 text-primary" />
                Site Health Score
              </CardTitle>
           </CardHeader>
           <CardContent className="flex flex-col items-center justify-center py-6 text-center">
              <div className="relative h-48 w-48 mb-6">
                 {/* SVG Donut Chart */}
                 <svg className="w-full h-full -rotate-90">
                    <circle
                      cx="96"
                      cy="96"
                      r="88"
                      stroke="currentColor"
                      strokeWidth="12"
                      fill="transparent"
                      className="text-muted"
                    />
                    <motion.circle
                      cx="96"
                      cy="96"
                      r="88"
                      stroke={stats.health > 90 ? "#10b981" : stats.health > 70 ? "#f59e0b" : "#ef4444"}
                      strokeWidth="12"
                      strokeDasharray={552.92}
                      initial={{ strokeDashoffset: 552.92 }}
                      animate={{ strokeDashoffset: 552.92 - (552.92 * stats.health) / 100 }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      strokeLinecap="round"
                      fill="transparent"
                    />
                 </svg>
                 <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <motion.span 
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-5xl font-black text-foreground"
                    >
                      {stats.health}%
                    </motion.span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SCORE</span>
                 </div>
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {stats.health === 100 ? "Perfect Health! No broken links found." : 
                 stats.health > 90 ? "Excellent. Minor issues to resolve." : 
                 stats.health > 70 ? "Needs attention. Several broken links discovered." :
                 stats.health > 40 ? "Warning. Moderate impact on user experience." :
                 "Critical state. Immediate action required. Your SEO and UX are at risk."}
              </p>
           </CardContent>
        </Card>

        {/* Quick Stats Grid */}
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
           <StatMetric 
              label="Total Links Found" 
              value={stats.total} 
              icon={<Globe className="h-5 w-5" />} 
              color="primary"
              description="Discovery is active"
           />
           <StatMetric 
              label="Broken Links" 
              value={stats.broken} 
              icon={<AlertCircle className="h-5 w-5" />} 
              color="danger"
              description={`${Math.round((stats.broken/stats.total)*100 || 0)}% failure rate`}
           />
           <StatMetric 
              label="Healthy Links" 
              value={stats.success} 
              icon={<CheckCircle2 className="h-5 w-5" />} 
              color="success"
              description="Ready to serve"
           />
           <StatMetric 
              label="Pending Check" 
              value={stats.pending} 
              icon={<Activity className="h-5 w-5" />} 
              color="info"
              description="Waiting in queue"
           />
           <StatMetric 
              label="Skipped Links" 
              value={stats.skipped} 
              icon={<Ghost className="h-5 w-5" />} 
              color="muted"
              description="Excluded by rules"
           />
        </div>
      </div>

      {/* Priority Fix List */}
      <div className="grid grid-cols-1 gap-8">
        <Card className="bg-card border-primary/5 shadow-xl flex flex-col">
           <CardHeader className="flex flex-row items-center justify-between border-b border-primary/5 pb-4">
              <div>
                <CardTitle className="text-xl font-black tracking-tight italic">Priority: Pages to Fix</CardTitle>
                <p className="text-sm text-muted-foreground mt-1 text-destructive/70 flex items-center gap-2 font-bold">
                   <AlertTriangle className="h-4 w-4" />
                   {stats.broken} broken links found across {stats.topPagesToFix.length} pages.
                </p>
              </div>
              <TrendingDown className="h-6 w-6 text-red-500/50" />
           </CardHeader>
           <CardContent className="p-0 flex-1 flex flex-col">
              {stats.topPagesToFix.length > 0 ? (
                <>
                 <PaginationControls 
                    currentPage={priorityPage} 
                    totalItems={stats.topPagesToFix.length} 
                    pageSize={priorityPageSize} 
                    onPageChange={setPriorityPage} 
                    position="top"
                 />
                 <div className="divide-y divide-primary/5 flex-1">
                    {stats.topPagesToFix
                      .slice((priorityPage - 1) * priorityPageSize, priorityPage * priorityPageSize)
                      .map((page, idx) => {
                        const globalIdx = ((priorityPage - 1) * priorityPageSize) + idx;
                        return (
                         <div key={page.url} className={cn(
                           "p-4 flex items-center justify-between hover:bg-primary/5 transition-colors group",
                           globalIdx < 3 && "bg-red-500/[0.02]"
                         )}>
                            <div className="flex flex-col min-w-0 mr-4">
                               <div className="flex items-center gap-2 mb-1">
                                  {globalIdx < 3 && <Zap className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />}
                                  <span className="text-xs font-black uppercase tracking-widest text-primary/60">Page {globalIdx + 1}</span>
                               </div>
                               <a 
                                 href={page.url} 
                                 target="_blank" 
                                 rel="noreferrer" 
                                 className="text-sm font-bold text-foreground break-words hover:text-primary transition-colors flex items-center gap-2 group/link"
                                 title="Visit page in new tab"
                               >
                                  {page.url}
                                  <ExternalLink className="h-3 w-3 opacity-0 group-hover/link:opacity-100 transition-opacity shrink-0 mt-0.5" />
                               </a>
                               <p className="text-[10px] text-muted-foreground mt-1">Found {page.count} broken links on this page.</p>
                            </div>
                            <div className="flex items-center gap-6 shrink-0">
                               <div className="text-right">
                                  <div className="text-lg font-black text-foreground leading-tight">{page.count}</div>
                                  <div className="text-[10px] font-bold uppercase tracking-tighter text-destructive">ERRORS</div>
                               </div>
                               <Button 
                                 variant="ghost" 
                                 size="sm" 
                                 className="text-[10px] font-black underline uppercase tracking-widest h-8 text-primary/60 hover:text-primary"
                                 asChild
                               >
                                 <Link href={`/scans/${scanId}?search=${encodeURIComponent(page.url)}`}>
                                   View full list
                                 </Link>
                               </Button>
                            </div>
                         </div>
                        );
                      })}
                 </div>
                 
                 <PaginationControls 
                    currentPage={priorityPage} 
                    totalItems={stats.topPagesToFix.length} 
                    pageSize={priorityPageSize} 
                    onPageChange={setPriorityPage} 
                    position="bottom"
                 />
                </>
              ) : (
                <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
                   <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                   </div>
                   <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest italic">All pages are healthy</p>
                </div>
              )}
           </CardContent>
           <div className="p-4 border-t border-primary/5 bg-muted/30">
              <Button variant="ghost" className="w-full text-xs font-black uppercase tracking-widest opacity-50 hover:opacity-100 h-8 gap-2" asChild>
                 <Link href={`/scans/${scanId}`}>
                    Go to detailed triage <ExternalLink className="h-3 w-3" />
                 </Link>
              </Button>
           </div>
        </Card>
      </div>

      {/* Recommendations / Tips */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <TipCard 
            icon={<Zap className="h-5 w-5 text-yellow-500" />} 
            title="Quick Tip" 
            text="Start fixing broken links on pages with the highest error counts to improve your site health score rapidly."
         />
         <TipCard 
            icon={<ArrowLeft className="h-5 w-5 text-blue-500" />} 
            title="Backlinks" 
            text="The first-level section analysis helps you identify which parts of your marketing funnel are most impacted."
         />
          <TipCard 
            icon={<Activity className="h-5 w-5 text-emerald-400" />} 
            title="In Progress" 
            text="This dashboard updates live. Watch your health score change as the scan discovers and checks more links."
         />
      </div>
    </div>
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

function StatMetric({ label, value, icon, color, description }: any) {
  const colorMap: any = {
    primary: "text-primary border-primary/20 bg-primary/5",
    success: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    danger: "text-destructive border-destructive/20 bg-destructive/5",
    info: "text-blue-400 border-blue-500/20 bg-blue-500/5",
    muted: "text-muted-foreground border-border bg-muted/20",
  };

  return (
    <Card className="bg-card border-primary/5 shadow-lg group hover:border-primary/20 transition-all duration-300">
      <CardContent className="p-5 flex items-start gap-4">
        <div className={cn("p-3 rounded-xl border shrink-0 group-hover:scale-110 transition-transform duration-300", colorMap[color])}>
           {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
          <div className="text-3xl font-black text-foreground leading-none mb-1">
             <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
             >
                {value.toLocaleString()}
             </motion.span>
          </div>
          <p className="text-[10px] font-medium text-muted-foreground truncate">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TipCard({ icon, title, text }: any) {
   return (
      <div className="bg-card/50 border border-primary/5 p-5 rounded-2xl flex items-start gap-4 group hover:bg-card transition-colors">
         <div className="mt-1 shrink-0 group-hover:rotate-12 transition-transform">{icon}</div>
         <div>
            <h4 className="text-sm font-black uppercase tracking-tight text-foreground mb-1">{title}</h4>
            <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
         </div>
      </div>
   );
}

function EmptyChartState({ icon, message }: any) {
   return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
         <div className="p-4 bg-muted/50 rounded-full">{icon}</div>
         <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest italic">{message}</p>
      </div>
   );
}

function ShieldCheckIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
