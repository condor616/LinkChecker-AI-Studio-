'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ShieldCheck, Database, User } from 'lucide-react';
import { BackupRestorePanel } from '@/components/backup-restore-panel';

export default function SettingsPage() {
  const [isAdmin, setIsAdmin] = useState(false);

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8 max-w-6xl mx-auto space-y-6 sm:space-y-8 min-w-0 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">System Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage infrastructure, data snapshots, and global configurations.
          </p>
        </div>
        {isAdmin && (
          <div className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider flex items-center gap-2 shrink-0 w-fit">
            <ShieldCheck className="h-3.5 w-3.5" /> Admin Panel
          </div>
        )}
      </div>

      <Tabs defaultValue="backup" className="w-full min-w-0 max-w-full space-y-6">
        <TabsList className="flex h-auto w-full min-w-0 flex-wrap items-stretch justify-start gap-1 overflow-visible rounded-xl border border-white/10 bg-white/5 p-1 shadow-2xl backdrop-blur-md sm:w-auto sm:flex-nowrap">
          <TabsTrigger
            value="backup"
            className="h-auto min-h-9 min-w-0 flex-[1_1_8rem] whitespace-normal px-2 py-2 text-xs leading-tight data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all rounded-lg font-bold sm:flex-none sm:whitespace-nowrap sm:px-8 sm:text-sm"
          >
            <Database className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2 shrink-0" /> Backup & Restore
          </TabsTrigger>
          <TabsTrigger
            value="preferences"
            className="h-auto min-h-9 min-w-0 flex-[1_1_8rem] whitespace-normal px-2 py-2 text-xs leading-tight data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-500 transition-all rounded-lg font-bold sm:flex-none sm:whitespace-nowrap sm:px-8 sm:text-sm"
          >
            <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2 shrink-0" /> User Preferences
          </TabsTrigger>
        </TabsList>

        <TabsContent value="backup" className="space-y-6">
          <BackupRestorePanel onAdminChange={setIsAdmin} />
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6">
          <Card className="border-white/10 bg-card/50 backdrop-blur-xl shadow-2xl overflow-hidden rounded-2xl min-w-0">
            <CardHeader className="bg-white/[0.03] border-b border-white/10 p-4 sm:p-8">
              <CardTitle className="text-xl sm:text-2xl font-black text-foreground">Experience Settings</CardTitle>
              <CardDescription className="text-muted-foreground/80 text-sm sm:text-base">
                Theme is toggled in the header. Product access is assigned on the People page (admins).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-8">
              <p className="text-muted-foreground text-sm">More LynxGEO preferences coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
