'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Clock, LogOut } from 'lucide-react';

export default function PendingApprovalPage() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="max-w-[500px] text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-blue-500/10 rounded-full">
              <Clock className="h-10 w-10 text-blue-500 animate-pulse" />
            </div>
          </div>
          <CardTitle className="text-2xl">Awaiting Admin Approval</CardTitle>
          <CardDescription>
            Your account has been created successfully, but it needs to be approved by an administrator before you can access the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Please contact your system administrator if you believe this is taking too long.
          </p>
          <Button variant="outline" onClick={handleLogout} className="w-full">
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
