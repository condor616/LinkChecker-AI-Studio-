'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { hasProductAccess } from '@lynx/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { safeCallbackUrl } from '@/lib/auth-redirect';

const lynxscanRegisterUrl = `${(process.env.NEXT_PUBLIC_LYNXSCAN_URL || 'http://localhost:3000').replace(/\/$/, '')}/login?register=true`;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'account_blocked') {
      setError('This account has been blocked. Contact an administrator.');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      const params = new URLSearchParams(window.location.search);
      const callback = safeCallbackUrl(params.get('callbackUrl'));
      const canUseGeo = hasProductAccess(data.user?.productAccess, 'lynxgeo');
      router.push(callback || (canUseGeo ? '/audits/new' : '/'));
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-[400px]">
        <CardHeader className="items-center text-center">
          <div className="mb-2 overflow-hidden rounded-lg border border-border">
            <img src="/logo.png" alt="Lynx GEO" className="h-14 w-14 object-cover" />
          </div>
          <CardTitle>
            Lynx <span className="text-primary italic">GEO</span>
          </CardTitle>
          <CardDescription>
            Sign in with the same account used for LynxScan. Access is granted per product.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              Don&apos;t have an account?{' '}
              <a href={lynxscanRegisterUrl} className="text-primary underline-offset-4 hover:underline">
                Create one in LynxScan
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
