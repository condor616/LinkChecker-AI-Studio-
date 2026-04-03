import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { scans } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, PlusCircle, History, LayoutTemplate, Users, Shield, Zap, BarChart3, Globe, Target, ArrowRight, CheckCircle2 } from 'lucide-react';
import * as motion from 'motion/react-client';
import { cn } from '@/lib/utils';

export default async function Dashboard() {
  const session = await getSession();
  
  if (session && session.role === 'PENDING') {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="max-w-md text-center glass-vibrant">
            <CardHeader>
              <CardTitle>Account Pending Approval</CardTitle>
              <CardDescription>
                Your account is currently pending approval by an administrator. You will be able to run scans once approved.
              </CardDescription>
            </CardHeader>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Fetch some stats (only if logged in)
  let totalScans = 0;
  if (session) {
    const [scanStats] = await db.select({ value: count() }).from(scans).where(eq(scans.userId, session.id));
    totalScans = scanStats?.value || 0;
  }

  const startScanHref = session ? "/scans/new" : "/login";
  const targetedScanHref = session ? "/scans/new?target=true" : "/login";

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Hero Section - Full Width */}
      <section className="px-8 py-24 md:py-40 relative overflow-hidden bg-[#0c0c0e]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[150px] rounded-full animate-pulse" />
          <div className="absolute bottom-[10%] right-[-5%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse-slow" />
        </div>
        
        <div className="max-w-[1600px] mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="max-w-5xl mx-auto text-center space-y-8 relative z-10"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-xs font-bold uppercase tracking-widest text-primary mb-4">
              <Zap className="h-3.5 w-3.5 fill-current" /> Next-Generation Monitoring
            </div>
            
            <h1 className="text-5xl md:text-8xl font-black tracking-tighter leading-[0.9]">
              <span className="block text-white">Lynx <span className="text-primary italic">Scan</span></span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-cyan-400 to-emerald-400 text-glow-vibrant">
                Digital Integrity.
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed font-light">
              Professional link monitoring with real-time insight. 
              Ensure every connection remains secure and functional.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
              <Button size="lg" asChild className="px-10 h-14 text-lg font-bold bg-gradient-to-r from-primary to-indigo-600 hover:shadow-[0_0_30px_rgba(168,85,247,0.5)] transition-all rounded-xl">
                <Link href={startScanHref}>{session ? 'Launch New Scan' : 'Get Started Free'}</Link>
              </Button>
              <Button variant="outline" size="lg" asChild className="px-10 h-14 text-lg border-white/10 hover:bg-white/5 backdrop-blur-sm rounded-xl">
                <Link href={session ? "/scans/history" : "/login"}>Explore Features</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="max-w-[1600px] mx-auto px-8 py-12 space-y-32">
        {/* Features Section */}
        <div className="relative py-24 overflow-hidden rounded-[40px] bg-emerald-500/[0.02]">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent opacity-50" />
          
          <div className="max-w-[1600px] mx-auto px-8 relative z-10">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-3xl md:text-5xl font-black tracking-tight text-white">Full-Stack Intelligence</h2>
              <div className="h-1.5 w-24 bg-emerald-500 mx-auto rounded-full shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
            </div>

            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                <FeatureCard 
                    href="/scans/new"
                    icon={<PlusCircle className="h-6 w-6" />}
                    title="New Scan"
                    description="Launch a comprehensive verification job."
                    delay={0.1}
                    color="purple"
                />
                <FeatureCard 
                    href="/scans/history"
                    icon={<History className="h-6 w-6" />}
                    title="History"
                    description="Access previous and ongoing reports."
                    delay={0.2}
                    color="blue"
                />
                <FeatureCard 
                    href="/templates"
                    icon={<LayoutTemplate className="h-6 w-6" />}
                    title="Templates"
                    description="Manage configurations for reuse."
                    delay={0.3}
                    color="cyan"
                />
                <FeatureCard 
                    href="/admin/users"
                    icon={<Users className="h-6 w-6" />}
                    title="Users"
                    description="Manage permissions and roles."
                    delay={0.4}
                    color="emerald"
                />
            </div>

            <div className="grid gap-8 md:grid-cols-3 pt-24">
                <BenefitItem 
                    icon={<Zap className="h-6 w-6" />}
                    title="Lightning Fast"
                    desc="Optimized concurrency engine crawls thousands of links in seconds."
                    color="text-primary"
                />
                <BenefitItem 
                    icon={<BarChart3 className="h-6 w-6" />}
                    title="Deep Analytics"
                    desc="Granular status codes, redirect chains, and anchor verification."
                    color="text-blue-400"
                />
                <BenefitItem 
                    icon={<Shield className="h-6 w-6" />}
                    title="Enterprise Ready"
                    desc="Intelligent retry logic and customizable user agents for accuracy."
                    color="text-emerald-400"
                />
            </div>
          </div>
        </div>

        {/* Targeted Scan Highlight */}
        <section className="px-8 py-20 relative">
          <div className="max-w-[1600px] mx-auto">
            <div className="glass-vibrant rounded-3xl overflow-hidden border border-white/10">
              <div className="grid lg:grid-cols-2">
                <div className="p-8 md:p-12 space-y-8 bg-gradient-to-br from-emerald-500/10 to-transparent">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                    <Target className="h-3.5 w-3.5" /> High Precision
                  </div>
                  
                  <div className="space-y-4">
                    <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight text-white">
                      Targeted <span className="text-emerald-400">Precision.</span><br/>
                      Zero Noise.
                    </h2>
                    <p className="text-lg text-slate-400 max-w-xl leading-relaxed">
                      Stop wasting resources on full site crawls. Audit exactly what matters—immediately and reliably.
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-6">
                    <HighlightItem 
                      icon={<Globe className="h-5 w-5" />}
                      title="Specific Assets"
                      desc="Perfect for PDFs, heavy images, and landing pages."
                    />
                    <HighlightItem 
                      icon={<Zap className="h-5 w-5" />}
                      title="Instant Results"
                      desc="Bypass the queue and get immediate feedback."
                    />
                  </div>

                  <div className="pt-4">
                    <Button size="lg" asChild className="group px-8 h-14 text-lg rounded-xl bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-all border-none">
                      <Link href={targetedScanHref}>
                        Try Targeted Audit
                        <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="bg-slate-950 p-8 flex items-center justify-center relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-50" />
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    className="relative w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-2xl overflow-hidden group-hover:border-emerald-500/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">Precision-Engine v4.0</div>
                    </div>
                    
                    <div className="space-y-4 font-mono text-xs">
                      <div className="flex gap-3 text-slate-500">
                        <span className="text-emerald-400 italic"># target_list.conf</span>
                      </div>
                      <div className="p-4 bg-black/40 rounded-lg border border-white/5 text-slate-300">
                        https://mysite.com/report-2024.pdf<br/>
                        https://mysite.com/api/v2/status<br/>
                        https://mysite.com/pricing<br/>
                        <span className="animate-pulse text-emerald-400">_</span>
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <div className="text-emerald-400 font-bold">ANALYZING...</div>
                        <div className="text-slate-500 italic">Verified [200 OK]</div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* System Status Summary */}
        <div className="pb-32">
          <div className="animated-border-container shadow-2xl hover:scale-[1.01] transition-transform duration-500">
              <div className="animated-border-gradient" />
              <motion.div 
                  initial={{ opacity: 0 }} 
                  whileInView={{ opacity: 1 }} 
                  viewport={{ once: true }}
                  className="animated-border-inner p-10 flex flex-col md:flex-row items-center justify-between gap-8 bg-card/90"
              >
                  <div className="space-y-3">
                      <h4 className="text-3xl font-black text-white">System Insights</h4>
                      <p className="text-muted-foreground text-lg max-w-lg">
                        {session 
                          ? `You have executed ${totalScans} production-grade scans with the Lynx engine.`
                          : "Join the elite monitoring platform and secure your digital assets."
                        }
                      </p>
                  </div>
                  <div className="flex items-center gap-10">
                      <div className="flex flex-col items-center">
                          <span className="text-4xl font-black text-primary text-glow-vibrant">{session ? totalScans : '99.9%'}</span>
                          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-bold mt-2">
                            {session ? 'Verified Scans' : 'Platform Uptime'}
                          </span>
                      </div>
                      <div className="h-16 w-px bg-white/10" />
                      <div className="flex flex-col items-center">
                          <span className="text-4xl font-black text-emerald-400">ACTIVE</span>
                          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-bold mt-2">Engine Status</span>
                      </div>
                  </div>
              </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ href, icon, title, description, delay, color }: { href: string, icon: React.ReactNode, title: string, description: string, delay: number, color: string }) {
    const colorMap: Record<string, string> = {
        purple: "group-hover:border-primary/50 group-hover:shadow-[0_0_30px_rgba(168,85,247,0.15)]",
        blue: "group-hover:border-blue-500/50 group-hover:shadow-[0_0_30px_rgba(59,130,246,0.15)]",
        cyan: "group-hover:border-cyan-500/50 group-hover:shadow-[0_0_30px_rgba(6,182,212,0.15)]",
        emerald: "group-hover:border-emerald-500/50 group-hover:shadow-[0_0_30px_rgba(16,185,129,0.15)]",
        indigo: "group-hover:border-indigo-500/50 group-hover:shadow-[0_0_30px_rgba(99,102,241,0.15)]"
    };

    const iconColorMap: Record<string, string> = {
        purple: "text-primary",
        blue: "text-blue-500",
        cyan: "text-cyan-500",
        emerald: "text-emerald-400",
        indigo: "text-indigo-500"
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            whileInView={{ opacity: 1, y: 0 }} 
            viewport={{ once: true }}
            transition={{ delay }}
        >
            <Link href={href} className="group">
                <Card className={cn("transition-all duration-300 h-full border-white/5 bg-white/[0.02] backdrop-blur-sm overflow-hidden relative", colorMap[color])}>
                    <div className={cn("absolute top-0 left-0 w-full h-1 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity", 
                        color === 'purple' ? "from-primary to-indigo-500" :
                        color === 'blue' ? "from-blue-500 to-cyan-500" :
                        color === 'cyan' ? "from-cyan-500 to-emerald-500" :
                        color === 'emerald' ? "from-emerald-400 to-cyan-500" :
                        "from-indigo-500 to-primary"
                    )} />
                    <CardHeader className="p-6">
                        <div className={cn("mb-4 h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center group-hover:scale-110 group-hover:bg-white/10 transition-all", iconColorMap[color])}>
                            {icon}
                        </div>
                        <CardTitle className="text-xl font-bold text-white group-hover:text-white transition-colors">{title}</CardTitle>
                        <CardDescription className="text-slate-400 mt-2 leading-relaxed">{description}</CardDescription>
                    </CardHeader>
                </Card>
            </Link>
        </motion.div>
    );
}

function BenefitItem({ icon, title, desc, color }: { icon: React.ReactNode, title: string, desc: string, color: string }) {
    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="p-8 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-sm space-y-4 hover:border-white/10 transition-colors"
        >
            <div className={cn("h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center shadow-inner", color)}>
                {icon}
            </div>
            <h3 className="text-xl font-bold text-white">{title}</h3>
            <p className="text-slate-400 leading-relaxed font-light">
                {desc}
            </p>
        </motion.div>
    );
}

function HighlightItem({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="flex gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-emerald-400 border border-white/10">
                {icon}
            </div>
            <div>
                <h4 className="font-bold text-white">{title}</h4>
                <p className="text-sm text-slate-400 leading-relaxed mt-1">{desc}</p>
            </div>
        </div>
    );
}
