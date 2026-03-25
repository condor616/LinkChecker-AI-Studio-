'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Users, PlusCircle, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="w-64 border-r bg-card flex flex-col h-screen">
      <div className="p-6">
        <h1 className="text-xl font-bold tracking-tight">LinkChecker Pro</h1>
      </div>
      <nav className="flex-1 px-4 space-y-2">
        <Link
          href="/"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname === '/' ? "bg-primary text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Link>
        <Link
          href="/scans/new"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname === '/scans/new' ? "bg-primary text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <PlusCircle className="h-4 w-4" />
          New Scan
        </Link>
        {role === 'ADMIN' && (
          <Link
            href="/admin/users"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname === '/admin/users' ? "bg-primary text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Users className="h-4 w-4" />
            Users
          </Link>
        )}
      </nav>
      <div className="p-4 border-t">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </div>
  );
}
