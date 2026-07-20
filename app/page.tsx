import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { scans } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, PlusCircle, History, LayoutTemplate, Users, Shield, Zap, BarChart3, Globe, Target, ArrowRight, CheckCircle2 } from 'lucide-react';
import * as motion from 'motion/react-client';
import { cn } from '@/lib/utils';
import { StartScanButton } from '@/components/scans/start-scan-button';

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
    const userDb = getDb(session.id);
    const [scanStats] = await userDb.select({ value: count() }).from(scans).where(eq(scans.userId, session.id));
    totalScans = scanStats?.value || 0;
  }

  const startScanHref = session ? "/scans/new" : "/login";
  const targetedScanHref = session ? "/scans/new?target=true" : "/login";

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Hero Section */}
      <section className="px-8 py-24 md:py-40 relative overflow-hidden">
        <div className="max-w-[1600px] mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="max-w-5xl mx-auto text-center space-y-8 relative z-10"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/5 border border-primary/20 text-xs font-bold uppercase tracking-widest text-primary mb-4">
              <Zap className="h-3.5 w-3.5 fill-current" /> Next-Generation Monitoring
            </div>
            
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-tight">
              <span className="block text-foreground">Lynx <span className="text-primary font-black italic">Scan</span></span>
              <span className="block text-muted-foreground text-4xl md:text-5xl font-bold">
                Professional Link Integrity.
              </span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed font-light">
              Enterprise-grade link monitoring with real-time insight. 
              Ensure every connection remains secure and functional.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
              {session ? (
                <StartScanButton size="lg" className="px-10 h-14 text-lg font-bold bg-primary text-primary-foreground hover:shadow-hover transition-all rounded-lg">
                  Launch New Scan
                </StartScanButton>
              ) : (
                <Button size="lg" asChild className="px-10 h-14 text-lg font-bold bg-primary text-primary-foreground hover:shadow-hover transition-all rounded-lg">
                  <Link href="/login">Get Started Free</Link>
                </Button>
              )}
              <Button variant="outline" size="lg" asChild className="px-10 h-14 text-lg rounded-lg">
                <Link href={session ? "/scans/history" : "/login"}>Explore Features</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="max-w-[1600px] mx-auto px-8 py-12 space-y-32">
        {/* Features Section */}
        <div className="relative py-24 overflow-hidden rounded-2xl bg-muted/30">
          <div className="max-w-[1600px] mx-auto px-8 relative z-10">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-3xl md:text-5xl font-black tracking-tight text-foreground">Full-Stack Intelligence</h2>
              <div className="h-1.5 w-24 bg-accent mx-auto rounded-full" />
            </div>

            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                <FeatureCard 
                    href="/scans/new"
                    icon={<PlusCircle className="h-6 w-6" />}
                    title="New Scan"
                    description="Launch a comprehensive verification job."
                    delay={0.1}
                    color="primary"
                />
                <FeatureCard 
                    href="/scans/history"
                    icon={<History className="h-6 w-6" />}
                    title="History"
                    description="Access previous and ongoing reports."
                    delay={0.2}
                    color="primary"
                />
                <FeatureCard 
                    href="/templates"
                    icon={<LayoutTemplate className="h-6 w-6" />}
                    title="Templates"
                    description="Manage configurations for reuse."
                    delay={0.3}
                    color="accent"
                />
                <FeatureCard 
                    href="/admin/users"
                    icon={<Users className="h-6 w-6" />}
                    title="Users"
                    description="Manage permissions and roles."
                    delay={0.4}
                    color="secondary"
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
                    color="text-accent"
                />
                <BenefitItem 
                    icon={<Shield className="h-6 w-6" />}
                    title="Enterprise Ready"
                    desc="Intelligent retry logic and customizable user agents for accuracy."
                    color="text-secondary"
                />
            </div>
          </div>
        </div>

        {/* Targeted Scan Highlight */}
        <section className="px-8 py-20 relative">
          <div className="max-w-[1600px] mx-auto">
            <div className="rounded-2xl overflow-hidden border border-border shadow-card">
              <div className="grid lg:grid-cols-2">
                <div className="p-8 md:p-12 space-y-8 bg-muted/50">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent text-xs font-bold uppercase tracking-wider">
                    <Target className="h-3.5 w-3.5" /> High Precision
                  </div>
                  
                  <div className="space-y-4">
                    <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight text-foreground">
                      Targeted <span className="text-accent font-black">Precision.</span><br/>
                      Zero Noise.
                    </h2>
                    <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
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
                    {session ? (
                      <StartScanButton size="lg" className="group px-8 h-14 text-lg rounded-lg bg-accent text-accent-foreground hover:shadow-hover shadow-card transition-all border-none">
                        Try Targeted Audit
                        <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                      </StartScanButton>
                    ) : (
                      <Button size="lg" asChild className="group px-8 h-14 text-lg rounded-lg bg-accent text-accent-foreground hover:shadow-hover shadow-card transition-all border-none">
                        <Link href="/login">
                          Try Targeted Audit
                          <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>

                <div className="bg-muted p-8 flex items-center justify-center relative group">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    className="relative w-full max-w-md bg-card border border-border rounded-xl p-6 shadow-card overflow-hidden group-hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-6 border-b border-border pb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase">Precision-Engine v4.0</div>
                    </div>
                    
                    <div className="space-y-4 font-mono text-xs">
                      <div className="flex gap-3 text-muted-foreground">
                        <span className="text-accent italic"># target_list.conf</span>
                      </div>
                      <div className="p-4 bg-muted rounded-lg border border-border text-foreground/70">
                        https://mysite.com/report-2024.pdf<br/>
                        https://mysite.com/api/v2/status<br/>
                        https://mysite.com/pricing<br/>
                        <span className="animate-pulse text-accent">_</span>
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <div className="text-accent font-bold">ANALYZING...</div>
                        <div className="text-muted-foreground italic">Verified [200 OK]</div>
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
                      <h4 className="text-3xl font-black text-foreground">System Insights</h4>
                      <p className="text-muted-foreground text-lg max-w-lg">
                        {session 
                          ? `You have executed ${totalScans} production-grade scans with the Lynx engine.`
                          : "Join the elite monitoring platform and secure your digital assets."
                        }
                      </p>
                  </div>
                  <div className="flex items-center gap-10">
                      <div className="flex flex-col items-center">
                          <span className="text-4xl font-black text-primary">{session ? totalScans : '99.9%'}</span>
                          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-bold mt-2">
                            {session ? 'Verified Scans' : 'Platform Uptime'}
                          </span>
                      </div>
                      <div className="h-16 w-px bg-border" />
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
        primary: "group-hover:border-primary/50 group-hover:bg-primary/5",
        accent: "group-hover:border-accent/50 group-hover:bg-accent/5",
        secondary: "group-hover:border-secondary/50 group-hover:bg-secondary/5",
    };

    const iconColorMap: Record<string, string> = {
        primary: "text-primary",
        accent: "text-accent",
        secondary: "text-secondary",
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            whileInView={{ opacity: 1, y: 0 }} 
            viewport={{ once: true }}
            transition={{ delay }}
        >
            {title === 'New Scan' ? (
                <StartScanButton className="group p-0 h-auto w-full bg-transparent border-none hover:bg-transparent block text-left shadow-none">
                    <Card className={cn("transition-all duration-300 h-full border-border bg-muted/30 overflow-hidden relative hover:shadow-hover", colorMap[color])}>
                        <div className={cn("absolute top-0 left-0 w-full h-1 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity", 
                            color === 'primary' ? "from-primary to-primary/50" :
                            color === 'accent' ? "from-accent to-accent/50" :
                            "from-secondary to-secondary/50"
                        )} />
                        <CardHeader className="p-6">
                            <div className={cn("mb-4 h-12 w-12 rounded-lg bg-muted flex items-center justify-center group-hover:scale-110 group-hover:bg-muted/80 transition-all", iconColorMap[color])}>
                                {icon}
                            </div>
                            <CardTitle className="text-xl font-bold text-foreground group-hover:text-foreground transition-colors">{title}</CardTitle>
                            <CardDescription className="text-muted-foreground mt-2 leading-relaxed">{description}</CardDescription>
                        </CardHeader>
                    </Card>
                </StartScanButton>
            ) : (
                <Link href={href} className="group">
                    <Card className={cn("transition-all duration-300 h-full border-border bg-muted/30 overflow-hidden relative hover:shadow-hover", colorMap[color])}>
                        <div className={cn("absolute top-0 left-0 w-full h-1 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity", 
                            color === 'primary' ? "from-primary to-primary/50" :
                            color === 'accent' ? "from-accent to-accent/50" :
                            "from-secondary to-secondary/50"
                        )} />
                        <CardHeader className="p-6">
                            <div className={cn("mb-4 h-12 w-12 rounded-lg bg-muted flex items-center justify-center group-hover:scale-110 group-hover:bg-muted/80 transition-all", iconColorMap[color])}>
                                {icon}
                            </div>
                            <CardTitle className="text-xl font-bold text-foreground group-hover:text-foreground transition-colors">{title}</CardTitle>
                            <CardDescription className="text-muted-foreground mt-2 leading-relaxed">{description}</CardDescription>
                        </CardHeader>
                    </Card>
                </Link>
            )}
        </motion.div>
    );
}

function BenefitItem({ icon, title, desc, color }: { icon: React.ReactNode, title: string, desc: string, color: string }) {
    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="p-8 rounded-lg border border-border bg-muted/30 space-y-4 hover:shadow-hover transition-all"
        >
            <div className={cn("h-12 w-12 rounded-lg bg-muted flex items-center justify-center", color)}>
                {icon}
            </div>
            <h3 className="text-xl font-bold text-foreground">{title}</h3>
            <p className="text-muted-foreground leading-relaxed font-light">
                {desc}
            </p>
        </motion.div>
    );
}

function HighlightItem({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="flex gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-accent border border-border">
                {icon}
            </div>
            <div>
                <h4 className="font-bold text-foreground">{title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed mt-1">{desc}</p>
            </div>
        </div>
    );
}
