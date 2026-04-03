import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { scans } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, CheckCircle, AlertCircle, Clock, Search, Filter, History as HistoryIcon, ChevronRight, PlusCircle } from 'lucide-react';
import * as motion from 'motion/react-client';
import { Input } from '@/components/ui/input';
import { ScanCard } from './scan-card';

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Fetch user's scans
  const userScans = await db.select().from(scans).where(eq(scans.userId, session.id)).orderBy(desc(scans.createdAt));

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-12 min-h-screen">
      <motion.div 
        initial={{ opacity: 0, y: -20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="flex flex-col md:flex-row md:items-end justify-between gap-6"
      >
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest">
            Audit Archive
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">Scan History</h1>
          <p className="text-slate-400 text-lg font-light max-w-2xl">Access and manage your previous website integrity audits.</p>
        </div>
        <Button asChild size="lg" className="h-12 px-8 font-bold bg-primary hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all rounded-xl">
          <Link href="/scans/new">
            <PlusCircle className="mr-2 h-5 w-5" />
            New Scan
          </Link>
        </Button>
      </motion.div>

      <div className="flex flex-col sm:flex-row items-center gap-4 bg-white/[0.02] p-4 rounded-2xl border border-white/5 backdrop-blur-md">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input 
            placeholder="Search scans by name or URL..." 
            className="pl-12 h-12 bg-black/20 border-white/10 rounded-xl focus:border-primary/50 transition-all placeholder:text-slate-600" 
          />
        </div>
        <Button variant="outline" size="lg" className="h-12 w-full sm:w-auto border-white/10 hover:bg-white/5 rounded-xl">
          <Filter className="mr-2 h-4 w-4" />
          Filter
        </Button>
      </div>

      <div className="space-y-6">
        {userScans.length === 0 ? (
          <Card className="p-20 text-center border-dashed border-white/10 bg-transparent glass-vibrant rounded-3xl">
            <div className="flex flex-col items-center gap-6">
              <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center">
                <HistoryIcon className="h-10 w-10 text-slate-600" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl font-bold">No scans found</CardTitle>
                <CardDescription className="text-lg">
                  You haven't run any scans yet. Start your first scan to see it here.
                </CardDescription>
              </div>
              <Button asChild size="lg" className="mt-4 px-10 h-14 text-lg font-bold rounded-xl">
                <Link href="/scans/new">Create First Scan</Link>
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4">
            {userScans.map((scan, i) => (
                <ScanCard key={scan.id} scan={scan} i={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
