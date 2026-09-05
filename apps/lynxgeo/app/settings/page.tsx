'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ShieldCheck, Database, User } from 'lucide-react';
import { BackupRestorePanel } from '@/components/backup-restore-panel';

export default function SettingsPage() {
  const [isAdmin, setIsAdmin] = useState(false);

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8 max-w-6xl mx-auto space-y-6 sm:space-y-8">
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

      <Tabs defaultValue="backup" className="w-full space-y-6">
        <TabsList className="bg-white/5 border border-white/10 p-1 h-auto min-h-12 shadow-2xl rounded-xl backdrop-blur-md w-full sm:w-auto flex flex-wrap sm:flex-nowrap justify-start">
          <TabsTrigger
            value="backup"
            className="px-3 sm:px-8 py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all rounded-lg font-bold text-xs sm:text-sm flex-1 sm:flex-none"
          >
            <Database className="h-4 w-4 mr-2 shrink-0" /> Backup & Restore
          </TabsTrigger>
          <TabsTrigger
            value="preferences"
            className="px-3 sm:px-8 py-2 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-500 transition-all rounded-lg font-bold text-xs sm:text-sm flex-1 sm:flex-none"
          >
            <User className="h-4 w-4 mr-2 shrink-0" /> User Preferences
          </TabsTrigger>
        </TabsList>

        <TabsContent value="backup" className="space-y-6">
          <BackupRestorePanel onAdminChange={setIsAdmin} />
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6">
          <Card className="border-white/10 bg-card/50 backdrop-blur-xl shadow-2xl overflow-hidden rounded-2xl">
            <CardHeader className="bg-white/[0.03] border-b border-white/10 p-8">
              <CardTitle className="text-2xl font-black text-foreground">Experience Settings</CardTitle>
              <CardDescription className="text-muted-foreground/80 text-base">
                Theme is toggled in the header. Product access is assigned on the People page (admins).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <p className="text-muted-foreground text-sm">More LynxGEO preferences coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
