'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function PendingPage() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto p-16 text-center space-y-3">
      <h1 className="text-2xl font-bold">Account pending approval</h1>
      <p className="text-muted-foreground">An administrator must approve your account before you can run GEO audits.</p>
      <Button variant="outline" onClick={handleLogout}>
        Sign out
      </Button>
    </div>
  );
}
