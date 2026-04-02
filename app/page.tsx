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

export default async function Dashboard() {
  const session = await getSession();
  
  if (session && session.role === 'PENDING') {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="max-w-md text-center">
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
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="px-8 py-12 md:py-20 bg-gradient-to-b from-background to-muted/30">
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="max-w-4xl mx-auto text-center space-y-6"
        >
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
            Professional Link Monitoring
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Ensure your website's integrity with our advanced broken link checker. 
            Real-time scanning, detailed reporting, and automated presets.
          </p>
          <div className="flex items-center justify-center gap-4 pt-4">
            <Button size="lg" asChild className="px-8 h-12 text-lg">
              <Link href={startScanHref}>{session ? 'Start New Scan' : 'Get Started'}</Link>
            </Button>
            {session && (
              <Button variant="outline" size="lg" asChild className="px-8 h-12 text-lg">
                <Link href="/scans/history">View History</Link>
              </Button>
            )}
          </div>
        </motion.div>
      </section>

      {/* Targeted Scan Highlight */}
      <section className="px-8 py-12 bg-slate-950 text-white overflow-hidden relative border-y border-white/5">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_120%,rgba(59,130,246,0.15),transparent)] pointer-events-none" />
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="grid lg:grid-cols-2 gap-12 items-center"
          >
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs font-bold uppercase tracking-wider">
                <Zap className="h-3.5 w-3.5 fill-current" /> New Feature
              </div>
              
              <div className="space-y-4">
                <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
                  Precision Auditing with <span className="text-primary">Targeted Scans</span>
                </h2>
                <p className="text-lg text-slate-400 max-w-xl leading-relaxed">
                  Stop wasting resources on full site crawls when you only need to verify specific assets. 
                  Audit exactly what matters—immediately and reliably.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <HighlightItem 
                  icon={<Target className="h-5 w-5" />}
                  title="Asset Focused"
                  desc="Verify PDFs, images, and specific landing pages."
                />
                <HighlightItem 
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  title="Deep Verification"
                  desc="Comprehensive status checks for every single URL."
                />
              </div>

              <div className="pt-4">
                <Button size="lg" asChild className="group px-8 h-14 text-lg rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] transition-all">
                  <Link href={targetedScanHref}>
                    Try Targeted Audit
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="relative lg:block hidden">
              <div className="absolute -inset-4 bg-primary/20 blur-3xl rounded-full" />
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="relative bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl overflow-hidden"
              >
                <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-500/50" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                    <div className="w-3 h-3 rounded-full bg-green-500/50" />
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">Targeted Engine v2.0</div>
                </div>
                
                <div className="space-y-4 font-mono text-xs">
                  <div className="flex gap-3 text-slate-500">
                    <span className="text-primary italic"># Bulk entry mode active</span>
                  </div>
                  <div className="p-3 bg-slate-950/50 rounded border border-white/5 text-slate-300">
                    https://mysite.com/annual-report-2024.pdf<br/>
                    https://mysite.com/assets/hero-v2.webp<br/>
                    https://mysite.com/pricing-plans<br/>
                    <span className="animate-pulse">|</span>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <div className="text-primary font-bold">SCANNING...</div>
                    <div className="text-slate-500 italic">Target found: [OK 200]</div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Main Grid Actions */}
      <div className="p-8 max-w-7xl mx-auto w-full space-y-12">
        {session && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <FeatureCard 
                  href="/scans/new"
                  icon={<PlusCircle className="h-6 w-6" />}
                  title="New Scan"
                  description="Configure and launch a new link verification job."
                  delay={0.1}
              />
              <FeatureCard 
                  href="/scans/history"
                  icon={<History className="h-6 w-6" />}
                  title="History"
                  description="Access all your previous and ongoing scan reports."
                  delay={0.2}
              />
              <FeatureCard 
                  href="/templates"
                  icon={<LayoutTemplate className="h-6 w-6" />}
                  title="Templates"
                  description="Manage scan configurations for quick reuse."
                  delay={0.3}
              />
              {session.role === 'ADMIN' && (
                   <FeatureCard 
                      href="/admin/users"
                      icon={<Users className="h-6 w-6" />}
                      title="User Management"
                      description="Administer system users and permissions."
                      delay={0.4}
                  />
              )}
          </div>
        )}

        {/* Product Highlights / Ads */}
        <div className="grid gap-8 md:grid-cols-3">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
                className="p-6 rounded-2xl border bg-card/50 backdrop-blur-sm space-y-4"
            >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Zap className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold">Lightning Fast</h3>
                <p className="text-muted-foreground italic">
                    Our high-performance engine crawls thousands of links in seconds with optimized concurrency.
                </p>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 }}
                className="p-6 rounded-2xl border bg-card/50 backdrop-blur-sm space-y-4"
            >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <BarChart3 className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold">Smart Analysis</h3>
                <p className="text-muted-foreground italic">
                    Get detailed breakdown of HTTP status codes, redirect chains, and broken anchors.
                </p>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.7 }}
                className="p-6 rounded-2xl border bg-card/50 backdrop-blur-sm space-y-4"
            >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Shield className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold">Robust Accuracy</h3>
                <p className="text-muted-foreground italic">
                    Avoid false positives with intelligent retry logic and customizable user agents.
                </p>
            </motion.div>
        </div>

        {/* Quick Stats Summary */}
        <div className="animated-border-container shadow-2xl">
            <div className="animated-border-gradient" />
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                transition={{ delay: 0.8 }}
                className="animated-border-inner p-8 flex flex-col md:flex-row items-center justify-between gap-6"
            >
                <div className="space-y-2">
                    <h4 className="text-2xl font-bold">System Status</h4>
                    <p className="text-muted-foreground">
                      {session 
                        ? `You have currently executed ${totalScans} verified scans.`
                        : "Join our platform to start monitoring your website integrity today."
                      }
                    </p>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-center">
                        <span className="text-3xl font-black text-primary">{session ? totalScans : '24/7'}</span>
                        <span className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                          {session ? 'Total Scans' : 'Uptime'}
                        </span>
                    </div>
                    <div className="h-12 w-px bg-primary/20" />
                    <div className="flex flex-col items-center">
                        <span className="text-3xl font-black text-primary">Live</span>
                        <span className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Engine</span>
                    </div>
                </div>
            </motion.div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ href, icon, title, description, delay }: { href: string, icon: React.ReactNode, title: string, description: string, delay: number }) {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay }}
        >
            <Link href={href}>
                <Card className="group hover:border-primary/50 transition-all hover:shadow-lg h-full">
                    <CardHeader>
                        <div className="mb-2 h-10 w-10 text-primary group-hover:scale-110 transition-transform">
                            {icon}
                        </div>
                        <CardTitle className="group-hover:text-primary transition-colors">{title}</CardTitle>
                        <CardDescription className="line-clamp-2">{description}</CardDescription>
                    </CardHeader>
                </Card>
            </Link>
        </motion.div>
    );
}

function HighlightItem({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                {icon}
            </div>
            <div>
                <h4 className="font-bold text-slate-100">{title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
            </div>
        </div>
    );
}
