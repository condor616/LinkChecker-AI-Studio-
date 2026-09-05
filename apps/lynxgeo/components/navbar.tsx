'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  LayoutDashboard,
  History,
  PlusCircle,
  Users,
  LogOut,
  LayoutTemplate,
  BookOpen,
  User as UserIcon,
  Settings,
  Menu,
  X,
  Moon,
  Sun,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Navbar({
  user,
  canUseGeo = false,
}: {
  user: { email: string; role: string } | null;
  canUseGeo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
  }, []);

  useEffect(() => {
    setIsMenuOpen(false);
    setIsDropdownOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isDropdownOpen]);

  const handleLogout = async () => {
    setIsDropdownOpen(false);
    setIsMenuOpen(false);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const handleThemeToggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', next);
  };

  const docsLink = { href: '/docs', label: 'Docs', icon: <BookOpen className="h-4 w-4" /> };
  const navLinks = user
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

  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border shadow-card bg-card">
        <div className="max-w-[1600px] flex h-16 items-center justify-between px-6 mx-auto">
          <div className="flex items-center gap-8 min-w-0">
            <Link href="/" className="flex items-center gap-2 group shrink-0">
              <div className="relative overflow-hidden rounded-lg border border-border transition-all duration-300">
                <img src="/logo.png" alt="Lynx GEO" className="h-10 w-10 object-cover" />
              </div>
              <span className="text-lg font-bold tracking-tight text-foreground">
                Lynx <span className="text-primary font-black italic">GEO</span>
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all rounded-md border',
                    pathname === link.href ||
                      (link.href !== '/' && pathname.startsWith(link.href))
                      ? 'text-primary bg-primary/10 border-primary/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted border-transparent',
                  )}
                >
                  {link.icon}
                  <span>{link.label}</span>
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => router.push('/settings')}
                  className={cn(
                    'flex items-center justify-center p-2 rounded-md border transition-all text-muted-foreground hover:text-foreground hover:bg-muted',
                    pathname === '/settings' && 'text-primary border-primary/50 bg-primary/10',
                  )}
                  title="System Settings"
                >
                  <Settings className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  onClick={handleThemeToggle}
                  className="flex items-center justify-center p-2 rounded-md border transition-all text-muted-foreground hover:text-foreground hover:bg-muted"
                  title="Toggle Dark/Light Mode"
                >
                  {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                </button>

                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className={cn(
                      'flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground shadow-card transition-all hover:shadow-hover active:scale-95',
                      isDropdownOpen && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                    )}
                    title="Account Settings"
                  >
                    <UserIcon className="h-4 w-4" />
                  </button>

                  <AnimatePresence>
                    {isDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="absolute right-0 mt-3 w-72 origin-top-right glass-panel z-[100]"
                      >
                        <div className="px-3 py-3 border-b border-border mb-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                            Account
                          </p>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-semibold truncate text-foreground">{user.email}</span>
                            <span className="text-[10px] w-fit px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                              {user.role}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1 p-1">
                          <button
                            type="button"
                            onClick={() => {
                              router.push('/profile');
                              setIsDropdownOpen(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <Settings className="h-4 w-4" />
                            Profile Settings
                          </button>

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                router.push('/admin/users');
                                setIsDropdownOpen(false);
                              }}
                              className={cn(
                                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                pathname === '/admin/users'
                                  ? 'bg-primary/10 text-primary'
                                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                              )}
                            >
                              <Users className="h-4 w-4" />
                              People
                            </button>
                          )}
                        </div>

                        <div className="mt-1 border-t border-border pt-1 p-1">
                          <button
                            type="button"
                            onClick={handleLogout}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <LogOut className="h-4 w-4" />
                            Logout
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleThemeToggle}
                  className="flex items-center justify-center p-2 rounded-md border transition-all text-muted-foreground hover:text-foreground hover:bg-muted"
                  title="Toggle Dark/Light Mode"
                >
                  {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                </button>
                <Link
                  href="/login"
                  className="hidden sm:inline text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/login"
                  className="hidden sm:inline-flex px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold shadow-elegant hover:shadow-hover transition-all"
                >
                  Get Started
                </Link>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-all hover:bg-muted rounded-md active:scale-95"
              title={isMenuOpen ? 'Close Menu' : 'Open Menu'}
              aria-expanded={isMenuOpen}
              aria-label={isMenuOpen ? 'Close Menu' : 'Open Menu'}
            >
              {isMenuOpen ? <X className="h-6 w-6 text-primary" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.button
              key="mobile-nav-backdrop"
              type="button"
              aria-label="Close menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 top-16 z-40 md:hidden bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              key="mobile-nav-sheet"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed inset-x-0 top-16 z-50 md:hidden bg-card shadow-card border-b border-border p-6"
            >
              <nav className="flex flex-col gap-4">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 text-lg font-semibold transition-all rounded-md border',
                      pathname === link.href
                        ? 'text-primary bg-primary/10 border-primary/30'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted border-transparent',
                    )}
                  >
                    {link.icon}
                    <span>{link.label}</span>
                  </Link>
                ))}

                {!user && (
                  <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
                    <Button variant="ghost" asChild onClick={() => setIsMenuOpen(false)}>
                      <Link href="/login">Sign In</Link>
                    </Button>
                    <Button asChild onClick={() => setIsMenuOpen(false)}>
                      <Link href="/login">Get Started</Link>
                    </Button>
                  </div>
                )}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
