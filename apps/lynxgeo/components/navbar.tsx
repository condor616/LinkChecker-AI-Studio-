'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, History, PlusCircle, Users, LogOut, LogIn, Moon, Sun, LayoutTemplate, BookOpen } from 'lucide-react';

export function Navbar({
  user,
  canUseGeo = false,
}: {
  user: { email: string; role: string } | null;
  canUseGeo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', next);
  };

  const docsLink = { href: '/docs', label: 'Docs', icon: <BookOpen className="h-4 w-4" /> };
  const links = user
    ? [
        { href: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
        docsLink,
        ...(canUseGeo
          ? [
              { href: '/templates', label: 'Templates', icon: <LayoutTemplate className="h-4 w-4" /> },
              { href: '/audits/history', label: 'History', icon: <History className="h-4 w-4" /> },
              { href: '/audits/new', label: 'New audit', icon: <PlusCircle className="h-4 w-4" /> },
            ]
          : []),
      ]
    : [docsLink];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-card">
      <div className="w-full max-w-[1600px] mx-auto flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative overflow-hidden rounded-lg border border-border transition-all duration-300 group-hover:border-primary/40">
              <img src="/logo.png" alt="Lynx GEO" className="h-10 w-10 object-cover" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              Lynx <span className="text-primary font-black italic">GEO</span>
            </span>
          </Link>
          <nav className="hidden md:flex gap-4">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-2 text-sm ${pathname === l.href ? 'text-primary font-semibold' : 'text-muted-foreground'}`}
              >
                {l.icon}
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {user?.role === 'ADMIN' && (
            <Link href="/admin/users">
              <Button variant="outline" size="sm">
                <Users className="h-4 w-4 mr-2" />
                People
              </Button>
            </Link>
          )}
          {user ? (
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              {user.email}
            </Button>
          ) : (
            <Link href="/login">
              <Button variant="outline" size="sm">
                <LogIn className="h-4 w-4 mr-2" />
                Sign in
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
