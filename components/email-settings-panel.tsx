'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail } from 'lucide-react';

type SmtpForm = {
  host: string;
  port: number;
  encryption: 'none' | 'starttls' | 'tls';
  user: string;
  pass: string;
  from: string;
  adminEmail: string;
};

const emptyForm: SmtpForm = {
  host: '',
  port: 26,
  encryption: 'none',
  user: '',
  pass: '',
  from: '',
  adminEmail: '',
};

export function EmailSettingsPanel() {
  const [form, setForm] = useState<SmtpForm>(emptyForm);
  const [passwordSet, setPasswordSet] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/email');
        if (res.status === 401 || res.status === 403) {
          setForbidden(true);
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load email settings');
        setForm({
          host: data.smtp.host || '',
          port: data.smtp.port || 26,
          encryption: data.smtp.encryption || 'none',
          user: data.smtp.user || '',
          pass: '',
          from: data.smtp.from || '',
          adminEmail: data.smtp.adminEmail || '',
        });
        setPasswordSet(Boolean(data.smtp.passwordSet));
        setConfigured(Boolean(data.smtp.configured));
        setTestTo(data.smtp.adminEmail || '');
      } catch (err: any) {
        setStatus({ type: 'error', message: err.message });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function payload() {
    return {
      host: form.host,
      port: Number(form.port),
      encryption: form.encryption,
      user: form.user,
      from: form.from,
      adminEmail: form.adminEmail,
      ...(form.pass ? { pass: form.pass } : {}),
    };
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save SMTP settings');
      setPasswordSet(Boolean(data.smtp.passwordSet));
      setConfigured(Boolean(data.smtp.configured));
      setForm((current) => ({ ...current, pass: '' }));
      setStatus({ type: 'success', message: 'SMTP settings saved.' });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo, config: payload() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test email failed');
      setStatus({ type: 'success', message: 'Test email sent. Check the inbox (and your mail server logs if needed).' });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setTesting(false);
    }
  }

  if (forbidden) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>Only administrators can configure SMTP.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="border-white/10 bg-card/50 backdrop-blur-xl shadow-2xl overflow-hidden rounded-2xl min-w-0">
      <CardHeader className="bg-white/[0.03] border-b border-white/10 p-4 sm:p-8">
        <CardTitle className="text-xl sm:text-2xl font-black text-foreground flex items-center gap-2 flex-wrap">
          <Mail className="h-6 w-6 shrink-0" /> SMTP
        </CardTitle>
        <CardDescription className="text-muted-foreground/80 text-base">
          Send mail through a standard SMTP server. Typical settings are host, port, encryption
          (none, STARTTLS, or TLS), optional username and password, and a from address.
          {configured ? ' SMTP is configured.' : ' SMTP is not configured yet.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-8">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="smtp-host">Host</Label>
              <Input
                id="smtp-host"
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                placeholder="smtp.example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-port">Port</Label>
              <Input
                id="smtp-port"
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => setForm({ ...form, port: Number(e.target.value) || 26 })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-encryption">Encryption</Label>
              <select
                id="smtp-encryption"
                value={form.encryption}
                onChange={(e) => setForm({ ...form, encryption: e.target.value as SmtpForm['encryption'] })}
                className="flex h-10 w-full rounded-xl border border-border bg-input px-3 text-sm"
              >
                <option value="none">None</option>
                <option value="starttls">STARTTLS</option>
                <option value="tls">TLS</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-from">From address</Label>
              <Input
                id="smtp-from"
                type="email"
                value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
                placeholder="lynxscan@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-user">Username (optional)</Label>
              <Input
                id="smtp-user"
                value={form.user}
                onChange={(e) => setForm({ ...form, user: e.target.value })}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-pass">Password (optional)</Label>
              <Input
                id="smtp-pass"
                type="password"
                value={form.pass}
                onChange={(e) => setForm({ ...form, pass: e.target.value })}
                placeholder={passwordSet ? 'Unchanged' : 'Leave blank if unused'}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="smtp-admin">Admin notify address</Label>
              <Input
                id="smtp-admin"
                type="email"
                value={form.adminEmail}
                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                placeholder="admin@example.com"
              />
            </div>
          </div>
          {status && (
            <p className={status.type === 'success' ? 'text-sm text-emerald-500' : 'text-sm text-destructive'}>
              {status.message}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end min-w-0">
            <Button type="submit" disabled={saving} className="w-full sm:w-auto justify-center">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save settings
            </Button>
            <div className="flex-1 space-y-2 min-w-0">
              <Label htmlFor="smtp-test-to">Send test email to</Label>
              <Input
                id="smtp-test-to"
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="you@example.com"
                className="min-w-0"
              />
            </div>
            <Button type="button" variant="outline" onClick={handleTest} disabled={testing || !testTo} className="w-full sm:w-auto justify-center">
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send test email
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
