import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { scans, links } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, CheckCircle, AlertCircle, Clock } from 'lucide-react';
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

  // Fetch user's scans
  const userScans = db.select().from(scans).where(eq(scans.userId, session.id)).orderBy(desc(scans.createdAt)).all();

  return (
    <div className="p-8 space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage and monitor your broken link scans.</p>
        </div>
        <Button asChild>
          <Link href="/scans/new">New Scan</Link>
        </Button>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Scans</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userScans.length}</div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Recent Scans</h2>
        {userScans.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No scans found. Create your first scan to get started.
          </Card>
        ) : (
          <div className="grid gap-4">
            {userScans.map((scan, i) => (
              <motion.div key={scan.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}>
                <Link href={`/scans/${scan.id}`}>
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardContent className="p-6 flex items-center justify-between">
                      <div className="space-y-1">
                        <h3 className="font-semibold">{scan.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          Started {new Date(scan.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          {scan.status === 'RUNNING' && <Activity className="h-4 w-4 text-blue-500 animate-pulse" />}
                          {scan.status === 'COMPLETED' && <CheckCircle className="h-4 w-4 text-green-500" />}
                          {scan.status === 'FAILED' && <AlertCircle className="h-4 w-4 text-red-500" />}
                          {scan.status === 'IDLE' && <Clock className="h-4 w-4 text-muted-foreground" />}
                          <span className="text-sm font-medium capitalize">{scan.status.toLowerCase()}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
