import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { hasProductAccess } from '@lynx/auth';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function Home() {
  const session = await getSession();
  const canUse = !!(session && hasProductAccess(session.productAccess, 'lynxgeo'));

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <section className="px-6 py-16 md:px-8 md:py-24 relative">
        <div className="max-w-[1600px] mx-auto">
          <div className="max-w-3xl space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold uppercase tracking-widest text-primary">
              AI discoverability
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight break-words">
              Lynx <span className="text-primary italic">GEO</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed font-light break-words">
              Technical audit of how ready a site is for AI search and agents: crawl access, extractability,
              markdown negotiation, llms.txt conventions, and schema.org vocabulary validation on JSON-LD.
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
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
                <Button size="lg" asChild className="w-full sm:w-auto">
                  <Link href={canUse ? '/audits/new' : '/login'}>Run an AI audit</Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
                  <Link href={canUse ? '/audits/history' : '/login'}>History</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
