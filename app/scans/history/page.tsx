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
            {userScans.map((scan, i) => {
              const config = JSON.parse(scan.config);
              const startUrl = config.startUrl || 'No URL';
              
              return (
                <motion.div key={scan.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <Link href={`/scans/${scan.id}`}>
                    <Card className="hover:bg-muted/50 transition-all hover:shadow-md cursor-pointer border-l-4 border-l-transparent dark:hover:border-l-primary/50">
                      <CardContent className="p-6 flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-lg">{scan.name}</h3>
                            {scan.status === 'RUNNING' && (
                               <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-medium animate-pulse">
                                 Live
                               </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {startUrl} • Started {new Date(scan.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-6">
                        <div className="text-right hidden sm:block">
                            <p className="text-xs text-muted-foreground uppercase font-semibold">Status</p>
                            <div className="flex items-center gap-2 mt-1">
                                {scan.status === 'RUNNING' && <Activity className="h-4 w-4 text-blue-500 animate-pulse" />}
                                {scan.status === 'COMPLETED' && <CheckCircle className="h-4 w-4 text-green-500" />}
                                {scan.status === 'FAILED' && <AlertCircle className="h-4 w-4 text-red-500" />}
                                {scan.status === 'IDLE' && <Clock className="h-4 w-4 text-muted-foreground" />}
                                <span className="text-sm font-medium capitalize">{scan.status.toLowerCase()}</span>
                            </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
          </div>
        )}
      </div>
    </div>
  );
}
