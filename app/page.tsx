import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { scans } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, PlusCircle, History, LayoutTemplate, Users, Shield, Zap, BarChart3, Globe } from 'lucide-react';
import * as motion from 'motion/react-client';

export default async function Dashboard() {
  const session = await getSession();
  if (!session) redirect('/login');

  if (session.role === 'PENDING') {
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

  // Fetch some stats
  const [scanStats] = await db.select({ value: count() }).from(scans).where(eq(scans.userId, session.id));
  const totalScans = scanStats?.value || 0;

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
              <Link href="/scans/new">Start New Scan</Link>
            </Button>
            <Button variant="outline" size="lg" asChild className="px-8 h-12 text-lg">
              <Link href="/scans/history">View History</Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Main Grid Actions */}
      <div className="p-8 max-w-7xl mx-auto w-full space-y-12">
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
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ delay: 0.8 }}
            className="rounded-3xl bg-primary/5 border border-primary/10 p-8 flex flex-col md:flex-row items-center justify-between gap-6"
        >
            <div className="space-y-2">
                <h4 className="text-2xl font-bold">System Status</h4>
                <p className="text-muted-foreground">You have currently executed {totalScans} verified scans.</p>
            </div>
            <div className="flex items-center gap-6">
                 <div className="flex flex-col items-center">
                    <span className="text-3xl font-black text-primary">{totalScans}</span>
                    <span className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Total Scans</span>
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
