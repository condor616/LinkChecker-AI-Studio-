'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus } from 'lucide-react';

type CreatedUser = {
  id: string;
  email: string;
  role: string;
  maxJobs: number;
  productAccess: { lynxscan: boolean; lynxgeo: boolean };
  createdAt: string | Date;
};

export function CreateUserDialog({ onCreated }: { onCreated: (user: CreatedUser) => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('USER');
  const [maxJobs, setMaxJobs] = useState(1);
  const [lynxscan, setLynxscan] = useState(true);
  const [lynxgeo, setLynxgeo] = useState(false);
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(false);

  function reset() {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setRole('USER');
    setMaxJobs(1);
    setLynxscan(true);
    setLynxgeo(false);
    setSendWelcomeEmail(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          confirmPassword,
          role,
          maxJobs,
          productAccess: { lynxscan, lynxgeo: role === 'ADMIN' ? true : lynxgeo },
          sendWelcomeEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');
      onCreated(data.user);
      reset();
      setOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="mb-4">
        <Plus className="h-4 w-4 mr-2" />
        Create user
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <h3 className="text-xl font-bold">Create user</h3>
              <div className="space-y-2">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-password">Password</Label>
                <Input
                  id="create-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-confirm-password">Confirm password</Label>
                <Input
                  id="create-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="create-role">Role</Label>
                  <select
                    id="create-role"
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value);
                      if (e.target.value === 'ADMIN') setLynxgeo(true);
                    }}
                    className="flex h-10 w-full rounded-xl border border-border bg-input px-3 text-sm"
                  >
                    <option value="USER">USER</option>
                    <option value="PENDING">PENDING</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="BLOCKED">BLOCKED</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-max-jobs">Max jobs</Label>
                  <Input
                    id="create-max-jobs"
                    type="number"
                    min={1}
                    max={100}
                    value={maxJobs}
                    onChange={(e) => setMaxJobs(parseInt(e.target.value, 10) || 1)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium">Product access</span>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={lynxscan} onChange={(e) => setLynxscan(e.target.checked)} />
                  LynxScan
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={role === 'ADMIN' || lynxgeo}
                    onChange={(e) => setLynxgeo(e.target.checked)}
                    disabled={role === 'ADMIN'}
                  />
                  Lynx GEO
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sendWelcomeEmail}
                  onChange={(e) => setSendWelcomeEmail(e.target.checked)}
                />
                Send account-ready email (does not include the password)
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    reset();
                    setOpen(false);
                  }}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
