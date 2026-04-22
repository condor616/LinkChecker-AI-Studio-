'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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
  const [data, setData] = useState<any>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [priorityPage, setPriorityPage] = useState(1);
  const priorityPageSize = 5;

  const fetchData = async () => {
    const res = await fetch(`/api/scans/${scanId}`);
    if (res.ok) {
      const json = await res.json();
      setData(json);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialData) {
      fetchData();
    }
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [scanId, initialData]);

  const stats = useMemo(() => {
    if (!data) return null;
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
  }, [data]);

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
                <h1 className="text-3xl font-black tracking-tight text-white">{scan.name} Dashboard</h1>
                <p className="text-slate-400 text-sm">Visual analysis of your site's health and issues.</p>
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
        <Card className="lg:col-span-1 bg-gradient-to-br from-slate-900/50 to-slate-950 border-primary/10 overflow-hidden relative group shadow-2xl">
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
                      className="text-slate-800"
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
                      className="text-5xl font-black text-white"
                    >
                      {stats.health}%
                    </motion.span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SCORE</span>
                 </div>
              </div>
              <p className="text-sm font-medium text-slate-300">
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
        <Card className="bg-slate-900 border-primary/5 shadow-xl flex flex-col">
           <CardHeader className="flex flex-row items-center justify-between border-b border-primary/5 pb-4">
              <div>
                <CardTitle className="text-xl font-black tracking-tight italic">Priority: Pages to Fix</CardTitle>
                <p className="text-sm text-muted-foreground mt-1 text-red-400/70 flex items-center gap-2 font-bold">
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
                                 className="text-sm font-bold text-slate-300 truncate max-w-md hover:text-primary transition-colors flex items-center gap-2"
                                 title="Visit page in new tab"
                               >
                                  {page.url}
                                  <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                               </a>
                               <p className="text-[10px] text-muted-foreground mt-1">Found {page.count} broken links on this page.</p>
                            </div>
                            <div className="flex items-center gap-6 shrink-0">
                               <div className="text-right">
                                  <div className="text-lg font-black text-white leading-tight">{page.count}</div>
                                  <div className="text-[10px] font-bold uppercase tracking-tighter text-red-400">ERRORS</div>
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
                   <p className="text-sm font-bold text-slate-400 uppercase tracking-widest italic">All pages are healthy</p>
                </div>
              )}
           </CardContent>
           <div className="p-4 border-t border-primary/5 bg-slate-950/30">
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

    return (
        <div className={cn(
            "flex items-center justify-between px-4 py-2 bg-muted/5",
            position === 'bottom' ? "border-t border-primary/10" : "border-b border-primary/10"
        )}>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                Page {currentPage} of {totalPages} <span className="ml-2 opacity-50">({totalItems} total)</span>
            </div>
            <div className="flex items-center gap-1">
                <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-7 w-7 border-primary/10 hover:border-primary/30" 
                    disabled={currentPage === 1}
                    onClick={() => onPageChange(currentPage - 1)}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-7 w-7 border-primary/10 hover:border-primary/30" 
                    disabled={currentPage === totalPages}
                    onClick={() => onPageChange(currentPage + 1)}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

function StatMetric({ label, value, icon, color, description }: any) {
  const colorMap: any = {
    primary: "text-primary border-primary/20 bg-primary/5",
    success: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    danger: "text-red-400 border-red-500/20 bg-red-500/5",
    info: "text-blue-400 border-blue-500/20 bg-blue-500/5",
    muted: "text-slate-400 border-slate-500/20 bg-slate-500/5",
  };

  return (
    <Card className="bg-slate-900 border-primary/5 shadow-lg group hover:border-primary/20 transition-all duration-300">
      <CardContent className="p-5 flex items-start gap-4">
        <div className={cn("p-3 rounded-xl border shrink-0 group-hover:scale-110 transition-transform duration-300", colorMap[color])}>
           {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
          <div className="text-3xl font-black text-white leading-none mb-1">
             <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
             >
                {value.toLocaleString()}
             </motion.span>
          </div>
          <p className="text-[10px] font-medium text-slate-500 truncate">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TipCard({ icon, title, text }: any) {
   return (
      <div className="bg-slate-900/50 border border-primary/5 p-5 rounded-2xl flex items-start gap-4 group hover:bg-slate-900 transition-colors">
         <div className="mt-1 shrink-0 group-hover:rotate-12 transition-transform">{icon}</div>
         <div>
            <h4 className="text-sm font-black uppercase tracking-tight text-slate-200 mb-1">{title}</h4>
            <p className="text-xs leading-relaxed text-slate-400">{text}</p>
         </div>
      </div>
   );
}

function EmptyChartState({ icon, message }: any) {
   return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
         <div className="p-4 bg-slate-800/50 rounded-full">{icon}</div>
         <p className="text-sm font-bold text-slate-500 uppercase tracking-widest italic">{message}</p>
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
