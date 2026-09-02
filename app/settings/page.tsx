'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ShieldCheck, Database, User, Sparkles, Layout, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useScanSelection } from '@/components/scans/scan-selection-provider';
import { BackupRestorePanel } from '@/components/backup-restore-panel';

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
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">System Settings</h1>
            <p className="text-muted-foreground mt-1">
              Manage infrastructure, data snapshots, and global configurations.
            </p>
          </div>
          {isAdmin && (
            <div className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-[0_0_15px_rgba(168,85,247,0.1)]">
              <ShieldCheck className="h-3.5 w-3.5" /> Admin Panel
            </div>
          )}
        </div>
      </motion.div>

      <Tabs defaultValue="backup" className="w-full space-y-6">
        <TabsList className="bg-white/5 border border-white/10 p-1 h-12 shadow-2xl rounded-xl backdrop-blur-md">
          <TabsTrigger
            value="backup"
            className="px-8 py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all rounded-lg font-bold"
          >
            <Database className="h-4 w-4 mr-2" /> Backup & Restore
          </TabsTrigger>
          <TabsTrigger
            value="preferences"
            className="px-8 py-2 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-500 transition-all rounded-lg font-bold"
          >
            <User className="h-4 w-4 mr-2" /> User Preferences
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
                Customize how you interact with the Lynx interface.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="flex items-center justify-between p-6 rounded-2xl bg-muted/30 border border-border hover:border-primary/30 transition-all group">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-lg font-bold text-foreground">New Scan Wizard</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                      A step-by-step guide to help you configure your scans. Disable this to go directly to the
                      advanced configuration page.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span
                    className={cn(
                      'text-xs font-black uppercase tracking-widest',
                      !preferences.skipWizard ? 'text-accent' : 'text-muted-foreground',
                    )}
                  >
                    {!preferences.skipWizard ? 'ENABLED' : 'DISABLED'}
                  </span>
                  <Button
                    variant={!preferences.skipWizard ? 'default' : 'outline'}
                    onClick={toggleWizardPreference}
                    disabled={prefsLoading}
                    className="rounded-lg font-bold"
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

              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 flex gap-4 opacity-50">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Layout className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-lg font-bold text-foreground">Compact Dashboard View</h4>
                  <p className="text-sm text-muted-foreground">
                    Coming soon: A denser view for managing many high-frequency scans.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
