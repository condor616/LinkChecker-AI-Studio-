'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ShieldCheck, Database, User, Sparkles, Layout, Loader2, Mail } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { useScanSelection } from '@/components/scans/scan-selection-provider';
import { BackupRestorePanel } from '@/components/backup-restore-panel';
import { EmailSettingsPanel } from '@/components/email-settings-panel';

export default function SettingsPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const { preferences, updatePreferences } = useScanSelection();
  const [prefsLoading, setPrefsLoading] = useState(false);

  async function toggleWizardPreference() {
    setPrefsLoading(true);
    const newValue = !preferences.skipWizard;
    try {
      await updatePreferences({ skipWizard: newValue });
    } catch (err) {
      console.error('Failed to update preferences:', err);
    } finally {
      setPrefsLoading(false);
    }
  }

  return (
    <div className="px-4 py-6 sm:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8 min-w-0 w-full">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2 sm:mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">System Settings</h1>
            <p className="text-muted-foreground mt-1">
              Manage infrastructure, data snapshots, and global configurations.
            </p>
          </div>
          {isAdmin && (
            <div className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-[0_0_15px_rgba(168,85,247,0.1)] shrink-0 w-fit">
              <ShieldCheck className="h-3.5 w-3.5" /> Admin Panel
            </div>
          )}
        </div>
      </motion.div>

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
          {isAdmin && (
            <TabsTrigger
              value="email"
              className="h-auto min-h-9 min-w-0 flex-[1_1_8rem] whitespace-normal px-2 py-2 text-xs leading-tight data-[state=active]:bg-sky-500/20 data-[state=active]:text-sky-400 transition-all rounded-lg font-bold sm:flex-none sm:whitespace-nowrap sm:px-8 sm:text-sm"
            >
              <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2 shrink-0" /> Email
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="backup" className="space-y-6">
          <BackupRestorePanel onAdminChange={setIsAdmin} />
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6">
          <Card className="border-white/10 bg-card/50 backdrop-blur-xl shadow-2xl overflow-hidden rounded-2xl min-w-0">
            <CardHeader className="bg-white/[0.03] border-b border-white/10 p-4 sm:p-8">
              <CardTitle className="text-xl sm:text-2xl font-black text-foreground">Experience Settings</CardTitle>
              <CardDescription className="text-muted-foreground/80 text-sm sm:text-base">
                Customize how you interact with the Lynx interface.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-8 space-y-6 sm:space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl bg-muted/30 border border-border hover:border-primary/30 transition-all group min-w-0">
                <div className="flex gap-3 sm:gap-4 min-w-0">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                    <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <h4 className="text-base sm:text-lg font-bold text-foreground">New audit wizard</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                      A step-by-step guide to help you configure your scans. Disable this to go directly to the
                      advanced configuration page.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto shrink-0">
                  <span
                    className={cn(
                      'text-xs font-black uppercase tracking-widest self-start sm:self-auto',
                      !preferences.skipWizard ? 'text-accent' : 'text-muted-foreground',
                    )}
                  >
                    {!preferences.skipWizard ? 'ENABLED' : 'DISABLED'}
                  </span>
                  <Button
                    variant={!preferences.skipWizard ? 'default' : 'outline'}
                    onClick={toggleWizardPreference}
                    disabled={prefsLoading}
                    className="rounded-lg font-bold w-full sm:w-auto justify-center"
                  >
                    {prefsLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : preferences.skipWizard ? (
                      'Enable Wizard'
                    ) : (
                      'Disable Wizard'
                    )}
                  </Button>
                </div>
              </div>

              <div className="p-4 sm:p-6 rounded-2xl bg-white/[0.02] border border-white/5 flex gap-3 sm:gap-4 opacity-50 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Layout className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="space-y-1 min-w-0">
                  <h4 className="text-base sm:text-lg font-bold text-foreground">Compact Dashboard View</h4>
                  <p className="text-sm text-muted-foreground">
                    Coming soon: A denser view for managing many high-frequency scans.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="email" className="space-y-6">
            <EmailSettingsPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
