'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, History as HistoryIcon } from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScanCard } from './scan-card';
import { filterScansByQuery, type HistoryScan } from '@/lib/utils/scan-history';

export function ScanHistoryList({ scans }: { scans: HistoryScan[] }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const matches = useMemo(
    () => filterScansByQuery(scans, debouncedQuery),
    [scans, debouncedQuery],
  );

  const hasQuery = debouncedQuery.trim().length > 0;

  return (
    <>
      <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-2xl border border-border backdrop-blur-md">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search scans by name or URL..."
            aria-label="Search scans by name or URL"
            className="pl-12 h-12 bg-muted border-border rounded-xl focus:border-primary/50 transition-all placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="space-y-6">
        {matches.length === 0 ? (
          <Card className="p-20 text-center border-dashed border-border bg-transparent glass-vibrant rounded-3xl">
            <div className="flex flex-col items-center gap-6">
              <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center">
                <HistoryIcon className="h-10 w-10 text-slate-600" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl font-bold">
                  {hasQuery ? 'No matching scans' : 'No scans found'}
                </CardTitle>
                <CardDescription className="text-lg">
                  {hasQuery
                    ? `No scans match “${debouncedQuery.trim()}”. Try a different name or URL.`
                    : "You haven't run any scans yet. Start your first scan to see it here."}
                </CardDescription>
              </div>
              {!hasQuery && (
                <Button asChild size="lg" className="mt-4 px-10 h-14 text-lg font-bold rounded-xl">
                  <Link href="/scans/new">Create First Scan</Link>
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {matches.map((scan, i) => (
              <ScanCard key={scan.id} scan={scan} i={i} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
