import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { hasProductAccess } from '@lynx/auth';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function Home() {
  const session = await getSession();
  const canUse = !!(session && hasProductAccess(session.productAccess, 'lynxgeo'));

  return (
    <div className="w-full max-w-[1600px] mx-auto px-8 py-16 space-y-8">
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold uppercase tracking-widest text-primary">
        AI discoverability
      </div>
      <h1 className="text-5xl font-black tracking-tight">
        Lynx <span className="text-primary italic">GEO</span>
      </h1>
      <p className="text-lg text-muted-foreground max-w-2xl">
        Technical audit of how ready a site is for AI search and agents: crawl access, extractability,
        markdown negotiation, and llms.txt conventions. Schema.org vocabulary checks come in phase 2.
      </p>
      {session && !canUse && (
        <Card>
          <CardHeader>
            <CardTitle>No Lynx GEO access</CardTitle>
            <CardDescription>Ask an admin to enable Lynx GEO on the People page.</CardDescription>
          </CardHeader>
        </Card>
      )}
      {(!session || canUse) && (
        <div className="flex gap-3">
          <Link href={canUse ? '/audits/new' : '/login'}>
            <Button size="lg">Run an AI audit</Button>
          </Link>
          <Link href={canUse ? '/audits/history' : '/login'}>
            <Button size="lg" variant="outline">
              History
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
