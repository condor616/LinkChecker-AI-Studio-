'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Database, 
  Download, 
  RefreshCw, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2,
  FileArchive,
  History,
  ShieldCheck,
  Server,
  Activity,
  Plus,
  UploadCloud
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Backup {
  filename: string;
  size: number;
  createdAt: string;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('backup');
  const [isAdmin, setIsAdmin] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Backup state
  const [backups, setBackups] = useState<Backup[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [backupOpLoading, setBackupOpLoading] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Naming Modal state
  const [showNamingModal, setShowNamingModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [filenameValue, setFilenameValue] = useState('');

  // Docker state
  const [dockerRunning, setDockerRunning] = useState<boolean | null>(null);
  const [isDockerLoading, setIsDockerLoading] = useState(false);
  const [dockerModalType, setDockerModalType] = useState<'stop' | 'start' | null>(null);

  useEffect(() => {
    async function init() {
      const sessionRes = await fetch('/api/auth/session');
      if (sessionRes.ok) {
        const data = await sessionRes.json();
        const role = data.user?.role?.toUpperCase();
        if (role === 'ADMIN' || role === 'USER') {
          if (role === 'ADMIN') {
            setIsAdmin(true);
            fetchDockerStatus();
          }
          fetchBackups();
        } else {
          window.location.href = '/';
        }
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (showNamingModal) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '-' + Date.now().toString().slice(-4);
      setCustomName('');
      setFilenameValue(`backup-${timestamp}.zip`);
    }
  }, [showNamingModal]);

  const handleNameChange = (val: string) => {
    setCustomName(val);
    if (val.trim()) {
      const sanitized = val.toLowerCase().replace(/[^a-z0-9]/g, '-');
      setFilenameValue(`${sanitized}.zip`);
    }
  };

  // --- Backup Logic ---
  async function fetchBackups() {
    setBackupsLoading(true);
    try {
      const res = await fetch('/api/database');
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (res.ok) {
          setBackups(data.backups || []);
        } else {
          console.error('Fetch backups failed:', data.error);
        }
      } catch (parseError) {
        console.error('Failed to parse backups JSON. Response:', text.slice(0, 200));
      }
    } catch (e) {
      console.error('Network error fetching backups:', e);
    } finally {
      setBackupsLoading(false);
    }
  }

  async function handleCreateBackup() {
    setShowNamingModal(false);
    setBackupOpLoading('create');
    setBackupStatus(null);
    try {
      const res = await fetch('/api/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', customFilename: filenameValue }),
      });
      
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error('Server returned non-JSON response:', text.slice(0, 500));
        setBackupStatus({ 
          type: 'error', 
          message: `Server Error: Received HTML instead of JSON. Check server logs.` 
        });
        return;
      }

      if (res.ok) {
        setBackupStatus({ type: 'success', message: `Backup "${filenameValue}" created successfully.` });
        fetchBackups();
      } else {
        setBackupStatus({ type: 'error', message: data.error || 'Failed to create backup' });
      }
    } catch (e) {
      console.error('Backup creation network error:', e);
      setBackupStatus({ type: 'error', message: 'Network error' });
    } finally {
      setBackupOpLoading(null);
    }
  }

  async function handleRestore(filename: string) {
    if (!confirm('WARNING: This will overwrite your current database and settings! Are you sure?')) return;
    setBackupOpLoading(`restore-${filename}`);
    setBackupStatus(null);
    try {
      const res = await fetch('/api/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', filename }),
      });
      if (res.ok) {
        setBackupStatus({ type: 'success', message: 'Database restored successfully!' });
      } else {
        const data = await res.json();
        setBackupStatus({ type: 'error', message: data.error || 'Restore failed' });
      }
    } catch (e) {
      setBackupStatus({ type: 'error', message: 'Network error during restore' });
    } finally {
      setBackupOpLoading(null);
    }
  }

  const handleUploadRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('WARNING: This will upload and restore the database from this file. IT WILL OVERWRITE ALL CURRENT DATA. Are you sure?')) {
      e.target.value = '';
      return;
    }

    setBackupOpLoading('upload');
    setBackupStatus(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('action', 'upload-restore');

    try {
      const res = await fetch('/api/database', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        setBackupStatus({ type: 'success', message: 'Database uploaded and restored successfully!' });
        fetchBackups();
      } else {
        const data = await res.json();
        setBackupStatus({ type: 'error', message: data.error || 'Upload/Restore failed' });
      }
    } catch (err) {
      setBackupStatus({ type: 'error', message: 'Network error during upload' });
    } finally {
      setBackupOpLoading(null);
      e.target.value = '';
    }
  };

  async function handleDeleteBackup(filename: string) {
    if (!confirm('Are you sure you want to delete this backup?')) return;
    try {
      const res = await fetch('/api/database', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      if (res.ok) fetchBackups();
    } catch (e) {
      console.error(e);
    }
  }

  // --- Docker Logic ---
  async function fetchDockerStatus() {
    try {
      const res = await fetch('/api/docker/status');
      const data = await res.json();
      setDockerRunning(data.running);
    } catch (e) {
      setDockerRunning(false);
    }
  }

  async function executeToggleDocker(type: 'start' | 'stop') {
    setDockerModalType(null);
    setIsDockerLoading(true);
    try {
      if (type === 'stop') {
        await fetch('/api/docker/stop', { method: 'POST' });
        setDockerRunning(false);
      } else {
        await fetch('/api/docker/start', { method: 'POST' });
        setDockerRunning(true);
      }
    } catch (e) {
      console.error(e);
    }
    setIsDockerLoading(false);
  }

  const formatSize = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2) + ' MB';

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleUploadRestore} 
        accept=".zip" 
        className="hidden" 
      />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">System Settings</h1>
            <p className="text-muted-foreground mt-1">Manage infrastructure, data snapshots, and global configurations.</p>
          </div>
          <div className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-[0_0_15px_rgba(168,85,247,0.1)]">
            <ShieldCheck className="h-3.5 w-3.5" /> Admin Panel
          </div>
        </div>
      </motion.div>

      <Tabs defaultValue="backup" className="w-full space-y-6" onValueChange={setActiveTab}>
        <TabsList className="bg-white/5 border border-white/10 p-1 h-12 shadow-2xl rounded-xl backdrop-blur-md">
          <TabsTrigger value="backup" className="px-8 py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all rounded-lg font-bold">
            <Database className="h-4 w-4 mr-2" /> Backup & Restore
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="docker" className="px-8 py-2 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-500 transition-all rounded-lg font-bold">
              <Server className="h-4 w-4 mr-2" /> Docker Services
            </TabsTrigger>
          )}
        </TabsList>

        {/* --- Backup Tab Content --- */}
        <TabsContent value="backup" className="space-y-6">
          <Card className="border-white/10 bg-card/50 backdrop-blur-xl shadow-2xl overflow-hidden rounded-2xl">
            <CardHeader className="bg-white/[0.03] border-b border-white/10 p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  <CardTitle className="text-2xl font-black text-white">Database Snapshots</CardTitle>
                  <CardDescription className="text-muted-foreground/80 text-base">Create and restore full database backups. Click a filename to download.</CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => fileInputRef.current?.click()} 
                    disabled={!!backupOpLoading} 
                    className="h-12 px-6 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold transition-all"
                  >
                    {backupOpLoading === 'upload' ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <UploadCloud className="mr-2 h-5 w-5" />}
                    Upload & Restore
                  </Button>
                  <Button 
                    onClick={() => setShowNamingModal(true)} 
                    disabled={!!backupOpLoading} 
                    className="h-12 px-6 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] transition-all"
                  >
                    {backupOpLoading === 'create' ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Plus className="mr-2 h-5 w-5" />}
                    New Snapshot
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {backupStatus && (
                <div className={cn("m-8 p-4 rounded-xl flex items-center gap-3 text-sm font-semibold border backdrop-blur-md animate-in fade-in slide-in-from-top-1", 
                  backupStatus.type === 'success' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]" : "bg-destructive/10 text-red-400 border-destructive/20 shadow-[0_0_20px_rgba(239,68,68,0.1)]")}>
                  {backupStatus.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertTriangle className="h-5 w-5 shrink-0" />}
                  <span className="flex-1">{backupStatus.message}</span>
                  <button onClick={() => setBackupStatus(null)} className="opacity-50 hover:opacity-100 px-1">✕</button>
                </div>
              )}
              <div className="overflow-x-auto px-4 pb-4">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-white/[0.02] text-muted-foreground uppercase text-[11px] font-black tracking-[0.2em] border-b border-white/5">
                    <tr>
                      <th className="px-6 py-5">Backup Filename</th>
                      <th className="px-6 py-5 text-center">File Size</th>
                      <th className="px-6 py-5">Date Created</th>
                      <th className="px-6 py-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {backupsLoading ? (
                      <tr><td colSpan={4} className="px-6 py-16 text-center"><Loader2 className="h-10 w-10 animate-spin mx-auto text-primary opacity-50" /></td></tr>
                    ) : backups.length === 0 ? (
                      <tr><td colSpan={4} className="px-6 py-20 text-center text-muted-foreground/50"><History className="h-16 w-16 mx-auto opacity-5 mb-4" /> No snapshots available.</td></tr>
                    ) : (
                      backups.map((bc) => (
                        <tr key={bc.filename} className="hover:bg-white/[0.03] transition-all group border-b border-white/[0.02]">
                          <td className="px-6 py-5 font-semibold">
                            <a 
                              href={`/api/database/download/${bc.filename}`}
                              className="flex items-center gap-4 text-white hover:text-primary transition-colors hover:translate-x-1 duration-200"
                              title="Click to download"
                            >
                              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all shadow-lg">
                                <FileArchive className="h-5 w-5" />
                              </div>
                              {bc.filename}
                            </a>
                          </td>
                          <td className="px-6 py-5 text-center text-muted-foreground tabular-nums font-mono">{formatSize(bc.size)}</td>
                          <td className="px-6 py-5 text-muted-foreground/80">{new Date(bc.createdAt).toLocaleString()}</td>
                          <td className="px-6 py-5 text-right space-x-3">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleRestore(bc.filename)} 
                              disabled={!!backupOpLoading} 
                              className="h-9 px-4 rounded-lg border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/40 font-bold"
                            >
                              {backupOpLoading === `restore-${bc.filename}` ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1.5" />} Restore
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleDeleteBackup(bc.filename)} 
                              className="h-9 w-9 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Docker Services Tab Content --- */}
        <TabsContent value="docker" className="space-y-6">
          <Card className="border-white/10 bg-card/50 backdrop-blur-xl shadow-2xl overflow-hidden rounded-2xl">
            <CardHeader className="bg-white/[0.03] border-b border-white/10 p-8">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-black text-white">Database Infrastructure</CardTitle>
                  <CardDescription className="text-muted-foreground/80 text-base">Control the underlying PostgreSQL and Redis containers.</CardDescription>
                </div>
                <div className={cn("px-5 py-2.5 rounded-xl border-2 flex items-center gap-3 text-xs font-black tracking-widest shadow-xl backdrop-blur-md", 
                  dockerRunning ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-emerald-500/5" : "bg-red-500/10 text-red-400 border-red-500/20 shadow-red-500/5")}>
                  {isDockerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                  {isDockerLoading ? 'UPDATING...' : dockerRunning ? 'STACK RUNNING' : 'STACK OFFLINE'}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-20 text-center space-y-10">
              <div className="max-w-xl mx-auto">
                <div className={cn("w-28 h-28 rounded-[2rem] mx-auto flex items-center justify-center mb-10 shadow-3xl transition-all duration-700 rotate-3 group-hover:rotate-0", 
                  dockerRunning ? "bg-emerald-500 text-white shadow-emerald-500/30 scale-110" : "bg-white/5 text-muted-foreground grayscale scale-95 border border-white/10")}>
                  <Server className="h-14 w-14" />
                </div>
                <h3 className="text-3xl font-black mb-4 text-white leading-tight">{dockerRunning ? 'All systems operational' : 'Infrastructure Offline'}</h3>
                <p className="text-muted-foreground/70 text-lg max-w-md mx-auto leading-relaxed">
                  The Docker stack includes the primary PostgreSQL database and Redis worker queue. 
                  Stopping the services will put the app into read-only mode.
                </p>
              </div>

              <div className="flex justify-center gap-6">
                {dockerRunning ? (
                  <Button size="lg" variant="destructive" className="h-14 px-10 rounded-2xl shadow-xl shadow-destructive/20 font-black text-lg hover:scale-105 active:scale-95 transition-all" onClick={() => setDockerModalType('stop')} disabled={isDockerLoading}>
                    Stop Docker Stack
                  </Button>
                ) : (
                  <Button size="lg" className="h-14 px-10 rounded-2xl bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/20 font-black text-lg hover:scale-105 active:scale-95 transition-all" onClick={() => setDockerModalType('start')} disabled={isDockerLoading}>
                    Start Docker Stack
                  </Button>
                )}
                <Button variant="outline" size="lg" className="h-14 px-6 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold" onClick={fetchDockerStatus} disabled={isDockerLoading}>
                  <RefreshCw className={cn("h-5 w-5 mr-2", isDockerLoading && "animate-spin")} /> Refresh
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Naming Modal for Backup */}
      <AnimatePresence>
        {showNamingModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md" onClick={() => setShowNamingModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} 
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-full max-w-md p-8 bg-card border border-white/10 shadow-[0_0_100px_rgba(0,0,0,1)] rounded-3xl">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary shadow-xl">
                  <Database className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Create Snapshot</h2>
                  <p className="text-sm text-muted-foreground font-medium">Give your backup a descriptive name.</p>
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="backup-name" className="text-xs font-black uppercase tracking-widest text-muted-foreground px-1">Friendly Name</Label>
                  <Input 
                    id="backup-name" 
                    placeholder="e.g. Before update, Post production..." 
                    value={customName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="h-12 bg-white/5 border-white/10 rounded-xl focus:ring-primary focus:border-primary text-white text-base"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filename" className="text-xs font-black uppercase tracking-widest text-muted-foreground px-1">Final Filename</Label>
                  <Input 
                    id="filename" 
                    value={filenameValue}
                    onChange={(e) => setFilenameValue(e.target.value)}
                    className="h-12 bg-white/5 border-white/10 rounded-xl text-muted-foreground font-mono text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground/60 px-2 italic font-medium">Extension .zip will be added if missing.</p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-10">
                <Button variant="ghost" onClick={() => setShowNamingModal(false)} className="h-12 px-6 rounded-xl text-muted-foreground hover:text-white font-bold transition-all">Cancel</Button>
                <Button onClick={handleCreateBackup} className="h-12 px-8 rounded-xl bg-primary hover:bg-primary/90 text-white font-black shadow-xl shadow-primary/20 transition-all active:scale-95">
                  Start Backup
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for Docker */}
      <AnimatePresence>
        {dockerModalType && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm" onClick={() => setDockerModalType(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} 
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-full max-w-lg p-8 bg-card border border-white/10 shadow-3xl rounded-3xl">
              <div className="flex flex-col space-y-3 text-center sm:text-left">
                <h2 className="text-2xl font-black text-white tracking-tight">{dockerModalType === 'stop' ? 'Stop Infrastructure?' : 'Start Infrastructure?'}</h2>
                <div className="text-muted-foreground text-base leading-relaxed">
                  {dockerModalType === 'stop' 
                    ? "This will halt PostgreSQL and Redis. Scans will be paused and the app will enter Offline mode."
                    : "This will start the backend services. The database will become available shortly."}
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-10">
                <Button variant="ghost" className="h-12 px-6 rounded-xl font-bold transition-all" onClick={() => setDockerModalType(null)}>Cancel</Button>
                <Button size="lg" variant={dockerModalType === 'stop' ? 'destructive' : 'default'} className="h-12 px-8 rounded-xl font-black transition-all active:scale-95 shadow-xl" onClick={() => executeToggleDocker(dockerModalType)}>Confirm Action</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
