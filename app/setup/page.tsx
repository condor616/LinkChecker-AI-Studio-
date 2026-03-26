'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Database, UserPlus, CheckCircle2, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function checkSetup() {
        const res = await fetch('/api/auth/register', { 
            method: 'POST', 
            body: JSON.stringify({ checkOnly: true }) 
        });
        const data = await res.json();
        // If users already exist, redirect to login
        if (data.exists) {
            router.push('/login');
        } else {
            setChecking(false);
        }
    }
    checkSetup();
  }, [router]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        setStep(3);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (checking) return null;

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="w-full max-w-[500px] space-y-8">
        <div className="flex justify-center">
            <div className="flex items-center gap-2 font-bold text-2xl tracking-tighter">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
                    LC
                </div>
                <span>LinkChecker <span className="text-primary">Pro</span></span>
            </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-blue-500" />
                    Storage Configuration
                  </CardTitle>
                  <CardDescription>Select your primary data storage backend.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="p-4 border-2 border-primary bg-primary/5 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="font-bold">Local SQLite</span>
                        <Badge variant="default">Recommended</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Perfect for local development, Google AI Studio, or single-user self-hosting. 
                        No external configuration required.
                    </p>
                  </div>
                  <div className="p-4 border border-dashed rounded-xl opacity-50 grayscale flex items-center justify-between">
                     <div className="space-y-1">
                        <span className="font-bold text-sm">Enterprise Mode (Cloud)</span>
                        <p className="text-[10px]">Cloud Postgres, Supabase, or Firebase.</p>
                     </div>
                     <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Locked</span>
                  </div>
                  <Button onClick={() => setStep(2)} className="w-full">
                    Continue to Admin Setup
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-green-500" />
                    Create First Administrator
                  </CardTitle>
                  <CardDescription>This account will have full system access.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateAdmin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="admin@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? 'Initializing System...' : 'Finalize & Launch'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6"
            >
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="h-12 w-12 text-green-500" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Setup Complete!</h2>
                <p className="text-muted-foreground">Your local SQLite environment is ready.</p>
              </div>
              <Button onClick={() => router.push('/')} className="w-full h-12 text-lg">
                Go to Dashboard
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Badge({ children, variant = "default" }: any) {
    return (
        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-primary text-primary-foreground">
            {children}
        </span>
    );
}
