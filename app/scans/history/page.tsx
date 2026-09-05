import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { scans } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import * as motion from 'motion/react-client';
import { ScanHistoryList } from './scan-history-list';

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const userDb = getDb(session.id);
  const userScans = await userDb.select().from(scans).where(eq(scans.userId, session.id)).orderBy(desc(scans.createdAt));

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
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-foreground">Scan History</h1>
          <p className="text-muted-foreground text-lg font-light max-w-2xl">Access and manage your previous website integrity audits.</p>
        </div>
        <Button asChild size="lg" className="h-12 px-8 font-bold bg-primary hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all rounded-xl">
          <Link href="/scans/new">
            <PlusCircle className="mr-2 h-5 w-5" />
            New audit
          </Link>
        </Button>
      </motion.div>

      <ScanHistoryList scans={userScans} />
    </div>
  );
}
