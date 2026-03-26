import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { scans } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, CheckCircle, AlertCircle, Clock, Search, Filter, History as HistoryIcon, ChevronRight } from 'lucide-react';
import * as motion from 'motion/react-client';
import { Input } from '@/components/ui/input';
import { ScanCard } from './scan-card';

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Fetch user's scans
  const userScans = db.select().from(scans).where(eq(scans.userId, session.id)).orderBy(desc(scans.createdAt)).all();

  return (
    <div className="p-8 space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scan History</h1>
          <p className="text-muted-foreground mt-1">View and manage your previous and ongoing link scans.</p>
        </div>
        <Button asChild>
          <Link href="/scans/new">New Scan</Link>
        </Button>
      </motion.div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search scans..." className="pl-10" />
        </div>
        <Button variant="outline" size="icon">
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        {userScans.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <div className="flex flex-col items-center gap-2">
              <HistoryIcon className="h-12 w-12 text-muted-foreground/50" />
              <CardTitle>No scans found</CardTitle>
              <CardDescription>
                You haven't run any scans yet. Start your first scan to see it here.
              </CardDescription>
              <Button asChild className="mt-4">
                <Link href="/scans/new">Create Scan</Link>
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
