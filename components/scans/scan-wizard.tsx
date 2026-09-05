'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Globe, 
  Target, 
  ArrowRight, 
  ArrowLeft, 
  Shield, 
  Zap, 
  Activity, 
  Users, 
  Lock, 
  Settings2, 
  CheckCircle2,
  Info,
  X,
  Plus,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useScanSelection } from './scan-selection-provider';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { USER_AGENTS, DEFAULT_USER_AGENT } from '@/lib/crawler/agents';

interface WizardData {
  name: string;
  startUrl: string;
  isTargeted: boolean;
  targetUrls: string[];
  skipExternal: boolean;
  excludeSubdomains: boolean;
  doNotTraverseBackward: boolean;
  maxDepth: number;
  rateLimit: number;
  randomDelay: number;
  userAgent: string;
  customUserAgent: string;
  auth: {
    username?: string;
    password?: string;
  };
}

const INITIAL_DATA: WizardData = {
  name: 'My New Audit',
  startUrl: 'https://',
  isTargeted: false,
  targetUrls: [],
  skipExternal: true,
  excludeSubdomains: true,
  doNotTraverseBackward: true,
  maxDepth: 2,
  rateLimit: 60,
  randomDelay: 500,
  userAgent: DEFAULT_USER_AGENT,
  customUserAgent: '',
  auth: {
    username: '',
    password: ''
  }
};

export function ScanWizard({ onExit }: { onExit: () => void }) {
  const router = useRouter();
  const { updatePreferences, closeModal } = useScanSelection();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isValidatingAuth, setIsValidatingAuth] = useState(false);
  const [authValidation, setAuthValidation] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const totalSteps = 7;

  const canGoNext = () => {
    if (step === 2) {
      const hasName = data.name.trim().length > 0;
      const hasStartUrl = data.startUrl.trim().length > 0 && data.startUrl !== 'https://';
      if (data.isTargeted) {
        return hasName && hasStartUrl && data.targetUrls.length > 0;
      }
      return hasName && hasStartUrl;
    }
    return true;
  };

  const nextStep = () => {
    if (step < totalSteps && canGoNext()) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleModeSelect = (targeted: boolean) => {
    setData(prev => ({ ...prev, isTargeted: targeted }));
    nextStep();
  };

  const handleFinish = async () => {
    setLoading(true);
    if (dontShowAgain) {
      await updatePreferences({ skipWizard: true });
    }

    try {
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        router.push(`/scans/${result.id}`);
        closeModal();
      }
    } catch (err) {
      console.error('Failed to start scan:', err);
    } finally {
      setLoading(false);
    }
  };

  const validateCredentials = async () => {
    if (!data.startUrl) {
      setAuthValidation({ type: 'error', message: 'Enter a starting URL first.' });
      return;
    }

    const username = data.auth.username?.trim() || '';
    const password = data.auth.password?.trim() || '';
    if (!username || !password) {
      setAuthValidation({ type: 'error', message: 'Both username and password are required.' });
      return;
    }

    setIsValidatingAuth(true);
    setAuthValidation(null);

    try {
      const res = await fetch('/api/scans/validate-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrl: data.startUrl,
          auth: { username, password },
        }),
      });

      const payload = await res.json().catch(() => ({}));

      if (res.status === 401 && payload?.error === 'Unauthorized') {
        setAuthValidation({ type: 'error', message: 'Session expired. Please sign in again.' });
        router.push('/login');
        return;
      }

      if (!res.ok || payload.valid === false) {
        setAuthValidation({
          type: 'error',
          message: payload.message || payload.error || 'Credential validation failed.',
        });
        return;
      }

      setAuthValidation({
        type: 'success',
        message: payload.message || 'Credentials validated successfully.',
      });
    } catch (error) {
      console.error(error);
      setAuthValidation({ type: 'error', message: 'Network error while validating credentials.' });
    } finally {
      setIsValidatingAuth(false);
    }
  };

  const handleSkip = () => {
    const query = data.isTargeted ? '?target=true' : '';
    // We could pre-fill the state in localStorage for the new scan page if we wanted
    localStorage.setItem('wizard_prefill', JSON.stringify(data));
    router.push(`/scans/new${query}`);
    closeModal();
  };

  return (
    <div className="flex flex-col h-full max-h-[85vh]">
      {/* Header */}
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
            {step}
          </div>
          <div>
            <h3 className="font-bold text-foreground">Audit Setup Wizard</h3>
            <p className="text-xs text-muted-foreground">Step {step} of {totalSteps}</p>
          </div>
        </div>
        <button onClick={onExit} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="h-1 w-full bg-white/5 overflow-hidden">
        <motion.div 
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${(step / totalSteps) * 100}%` }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            {step === 1 && (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-black text-foreground">Choose Audit Mode</h2>
                  <p className="text-muted-foreground">Select how the engine should navigate through your site.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <button 
                    onClick={() => handleModeSelect(false)}
                    className={cn(
                      "p-6 rounded-2xl border-2 text-left transition-all group",
                      !data.isTargeted ? "bg-primary/10 border-primary shadow-[0_0_30px_rgba(168,85,247,0.1)]" : "bg-white/5 border-white/5 hover:border-white/10"
                    )}
                  >
                    <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform">
                      <Globe className="h-5 w-5" />
                    </div>
                    <h4 className="font-bold text-foreground mb-2">Recursive Discovery</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Crawls your entire site from the start URL. Perfect for a full site audit to find all broken links.
                    </p>
                  </button>

                  <button 
                    onClick={() => handleModeSelect(true)}
                    className={cn(
                      "p-6 rounded-2xl border-2 text-left transition-all group",
                      data.isTargeted ? "bg-emerald-500/10 border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.1)]" : "bg-white/5 border-white/5 hover:border-white/10"
                    )}
                  >
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
                      <Target className="h-5 w-5" />
                    </div>
                    <h4 className="font-bold text-foreground mb-2">Targeted Audit</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Focuses ONLY on a specific list of pages, PDFs, or images. Faster and avoids noise from large sites.
                    </p>
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-foreground">Basic Details</h2>
                  <p className="text-muted-foreground italic text-sm">Every engine needs a name and a starting point.</p>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-primary">Audit Project Name</Label>
                    <Input 
                      value={data.name} 
                      onChange={e => setData({...data, name: e.target.value})}
                      placeholder="e.g. My Website Audit"
                      className={cn(
                        "bg-white/5 border-white/10 h-12",
                        step === 2 && !data.name.trim() && "border-red-500/50 focus:ring-red-500/50"
                      )}
                    />
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 px-1 font-medium">
                      {step === 2 && !data.name.trim() ? (
                        <span className="text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Project name is required</span>
                      ) : (
                        <span className="flex items-center gap-1"><Info className="h-3 w-3" /> Used to identify this report later in your history.</span>
                      )}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-primary">Starting URL</Label>
                    <Input 
                      value={data.startUrl} 
                      onChange={e => setData({...data, startUrl: e.target.value})}
                      placeholder="https://example.com"
                      className={cn(
                        "bg-white/5 border-white/10 h-12 font-mono",
                        step === 2 && (!data.startUrl.trim() || data.startUrl === 'https://') && "border-red-500/50 focus:ring-red-500/50"
                      )}
                    />
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 px-1 font-medium">
                      {step === 2 && (!data.startUrl.trim() || data.startUrl === 'https://') ? (
                        <span className="text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Valid entry point is required</span>
                      ) : (
                        <span className="flex items-center gap-1"><Info className="h-3 w-3" /> The crawler will begin its journey from this address.</span>
                      )}
                    </p>
                  </div>

                  {data.isTargeted && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="space-y-2"
                    >
                      <Label className="text-xs font-bold uppercase tracking-wider text-emerald-400">Target URLs (One per line)</Label>
                      <Textarea 
                        rows={4}
                        placeholder="Paste URLs here..."
                        value={data.targetUrls.join('\n')}
                        onChange={e => setData({...data, targetUrls: e.target.value.split('\n').filter(u => u.trim())})}
                        className={cn(
                            "bg-emerald-500/5 border-emerald-500/20 text-xs font-mono",
                            step === 2 && data.targetUrls.length === 0 && "border-red-500/50 focus:ring-red-500/50"
                        )}
                      />
                      <p className="text-[10px] text-emerald-400/70 flex items-center gap-1.5 px-1 font-medium">
                        {step === 2 && data.targetUrls.length === 0 ? (
                           <span className="text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> At least one target URL is required for targeted scans</span>
                        ) : (
                           <span className="flex items-center gap-1"><Info className="h-3 w-3" /> List specifically which assets or pages are critically important to audit.</span>
                        )}
                      </p>
                    </motion.div>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-foreground">Crawling Rules</h2>
                  <p className="text-muted-foreground italic text-sm">Define the boundaries for the spider's web.</p>
                </div>

                <div className="grid gap-4">
                  <SelectionToggle 
                    icon={<Globe className="h-4 w-4" />}
                    title="Skip External Domains"
                    description="Verified links to other sites but never follows them. Recommended to avoid rabbit holes."
                    active={data.skipExternal}
                    onClick={() => setData({...data, skipExternal: !data.skipExternal})}
                  />
                  <SelectionToggle 
                    icon={<Users className="h-4 w-4" />}
                    title="Exclude Subdomains"
                    description="Drops links to blog.site.com / api.site.com when you start at site.com. Not fetched."
                    active={data.excludeSubdomains}
                    onClick={() => setData({...data, excludeSubdomains: !data.excludeSubdomains})}
                  />
                  <SelectionToggle 
                    icon={<ArrowRight className="h-4 w-4" />}
                    title="Stay in Subpath Only"
                    description="If you start at site.com/docs, it will NEVER crawl site.com/blog. Very high precision."
                    active={data.doNotTraverseBackward}
                    onClick={() => setData({...data, doNotTraverseBackward: !data.doNotTraverseBackward})}
                  />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-foreground">Performance Tuning</h2>
                  <p className="text-muted-foreground italic text-sm">Balance speed with server respect.</p>
                </div>

                <div className="grid gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase text-primary">Max Depth</Label>
                      <span className="text-xs font-mono text-muted-foreground bg-white/5 px-2 py-0.5 rounded">{data.maxDepth === 0 ? 'Infinite' : data.maxDepth} levels</span>
                    </div>
                    <Input 
                      type="number" 
                      min={0}
                      value={data.maxDepth} 
                      onChange={e => setData({...data, maxDepth: parseInt(e.target.value) || 0})}
                      className="bg-white/5 border-white/10"
                    />
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      How many clicks away from the homepage the crawler should go. <strong>0</strong> means it won't stop until everything is found.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase text-primary">Requests Per Minute</Label>
                      <span className="text-xs font-mono text-muted-foreground bg-white/5 px-2 py-0.5 rounded">{data.rateLimit} req/min</span>
                    </div>
                    <Input 
                      type="number" 
                      min={1}
                      value={data.rateLimit} 
                      onChange={e => setData({...data, rateLimit: parseInt(e.target.value) || 60})}
                      className="bg-white/5 border-white/10"
                    />
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Limits the crawl speed. Higher is faster, lower is safer for small servers to prevent accidental DDoS.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase text-primary">Random Delay (ms)</Label>
                      <span className="text-xs font-mono text-muted-foreground bg-white/5 px-2 py-0.5 rounded">{data.randomDelay}ms</span>
                    </div>
                    <Input 
                      type="number" 
                      min={0}
                      step={100}
                      value={data.randomDelay} 
                      onChange={e => setData({...data, randomDelay: parseInt(e.target.value) || 0})}
                      className="bg-white/5 border-white/10"
                    />
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Adds a sleep time before each request. Mimics human behavior to avoid triggering firewalls.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-foreground">Browser Identity</h2>
                  <p className="text-muted-foreground italic text-sm">Choose how the crawler presents itself to the webserver.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-primary">Predefined User Agent</Label>
                    <select 
                      className="w-full h-11 px-4 bg-white/5 border border-white/10 rounded-xl text-sm appearance-none cursor-pointer hover:bg-white/10 transition-colors outline-none focus:ring-1 ring-primary/50"
                      value={data.userAgent}
                      onChange={e => setData({...data, userAgent: e.target.value})}
                    >
                      {USER_AGENTS.map(agent => (
                        <option key={agent.name} value={agent.value} className="bg-card">{agent.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-primary">Custom Override</Label>
                    <Input 
                      placeholder="Mozilla/5.0..."
                      value={data.customUserAgent}
                      onChange={e => setData({...data, customUserAgent: e.target.value})}
                      className="bg-white/5 border-white/10 font-mono text-[10px]"
                    />
                    <p className="text-[10px] text-muted-foreground italic">
                      Leave empty to use the selection above. Advanced users can paste any browser string here.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-foreground">Advanced Authentication</h2>
                  <p className="text-muted-foreground italic text-sm">Crawl behind protected directories using Basic Auth.</p>
                </div>

                <div className="p-6 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-widest text-primary">Credentials</span>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground">Username</Label>
                      <Input 
                        placeholder="admin"
                        value={data.auth.username}
                        onChange={e => setData({...data, auth: {...data.auth, username: e.target.value}})}
                        className="bg-white/5 border-white/10 h-10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground">Password</Label>
                      <Input 
                        type="password"
                        placeholder="••••••••"
                        value={data.auth.password}
                        onChange={e => setData({...data, auth: {...data.auth, password: e.target.value}})}
                        className="bg-white/5 border-white/10 h-10"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed pt-2">
                    Note: These credentials are sent in the header of every request using standard HTTP Basic authentication.
                  </p>
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={validateCredentials}
                      disabled={isValidatingAuth}
                      className="h-9 rounded-xl border-white/10 bg-white/5"
                    >
                      {isValidatingAuth ? 'Validating...' : 'Validate Credentials'}
                    </Button>
                    {authValidation && (
                      <span className={cn(
                        'text-[11px] font-semibold',
                        authValidation.type === 'success' ? 'text-emerald-400' : 'text-destructive'
                      )}>
                        {authValidation.message}
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl flex gap-3">
                  <Shield className="h-5 w-5 text-amber-500 shrink-0" />
                  <p className="text-[10px] text-amber-500/80 leading-relaxed font-medium">
                    Use this ONLY if the site specifically asks for a browser pop-up login. For form logins, you may need a template preset or custom script.
                  </p>
                </div>
              </div>
            )}

            {step === 7 && (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <h2 className="text-3xl font-black text-foreground">Review Configuration</h2>
                  <p className="text-muted-foreground">Ready to initialize the Lynx Engine v4.0</p>
                </div>

                <div className="grid gap-3 max-w-md mx-auto">
                    <SummaryItem label="Project" value={data.name} icon={<Activity className="h-3.5 w-3.5" />} />
                    <SummaryItem label="Start URL" value={data.startUrl} icon={<Globe className="h-3.5 w-3.5" />} />
                    <SummaryItem label="Mode" value={data.isTargeted ? "Targeted Audit" : "Recursive Crawl"} icon={<Shield className="h-3.5 w-3.5" />} />
                    <SummaryItem label="Performance" value={`${data.rateLimit} req/min | Depth: ${data.maxDepth === 0 ? 'Infinite' : data.maxDepth}`} icon={<Zap className="h-3.5 w-3.5" />} />
                    <SummaryItem label="Restrictions" value={`${[data.skipExternal && 'No External', data.excludeSubdomains && 'No Subdomains'].filter(Boolean).join(', ') || 'None'}`} icon={<Settings2 className="h-3.5 w-3.5" />} />
                </div>

                <div className="flex items-center justify-center gap-3 py-4">
                  <div 
                    onClick={() => setDontShowAgain(!dontShowAgain)}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <div className={cn(
                      "w-4 h-4 rounded border transition-all flex items-center justify-center",
                      dontShowAgain ? "bg-primary border-primary" : "border-white/20 group-hover:border-white/40"
                    )}>
                      {dontShowAgain && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span className="text-[11px] font-bold text-muted-foreground group-hover:text-foreground transition-colors">Do not show this wizard again</span>
                  </div>
                </div>

                <div className="pt-4 text-center">
                  <p className="text-[10px] text-muted-foreground mb-4">
                    By launching, the engine will consume {data.rateLimit} requests per minute until completion.
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-white/5 bg-white/[0.02] flex items-center justify-between gap-4">
        <Button 
          variant="ghost" 
          onClick={handleSkip}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Skip to Manual Setup
        </Button>

        <div className="flex items-center gap-2">
          {step > 1 && (
            <Button 
              variant="outline" 
              onClick={prevStep}
              className="px-6 rounded-xl border-white/10 bg-white/5"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          )}

          {step < totalSteps ? (
            <Button 
              onClick={nextStep}
              disabled={!canGoNext()}
              className="px-8 rounded-xl bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 disabled:opacity-50 disabled:grayscale transition-all"
            >
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button 
              onClick={handleFinish}
              disabled={loading}
              className="px-10 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:shadow-[0_0_30px_rgba(168,85,247,0.5)] transition-all font-black text-lg h-12"
            >
              {loading ? "Starting..." : "Start audit"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SelectionToggle({ icon, title, description, active, onClick }: { icon: React.ReactNode, title: string, description: string, active: boolean, onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "p-4 rounded-xl border-2 cursor-pointer transition-all flex gap-4 group",
        active ? "bg-primary/5 border-primary/40 shadow-inner" : "bg-white/5 border-white/5 hover:border-white/10"
      )}
    >
      <div className={cn(
        "h-10 w-10 shrink-0 rounded-lg flex items-center justify-center transition-all",
        active ? "bg-primary text-primary-foreground shadow-xl" : "bg-muted text-muted-foreground group-hover:bg-muted/80"
      )}>
        {icon}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h4 className="font-bold text-sm text-foreground">{title}</h4>
          {active && <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed leading-snug">
          {description}
        </p>
      </div>
    </div>
  );
}

function SummaryItem({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/5">
      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-muted-foreground">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{label}</p>
        <p className="text-xs text-foreground font-semibold truncate">{value || 'Not configured'}</p>
      </div>
    </div>
  );
}
