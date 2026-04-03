'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  Users, 
  PlusCircle, 
  LogOut, 
  LayoutTemplate, 
  History, 
  User as UserIcon,
  ChevronDown,
  Settings,
  Database,
  RefreshCw,
  Activity,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface NavbarProps {
  user: {
    email: string;
    role: string;
  } | null;
}

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const navLinks = user ? [
    { href: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    { href: '/templates', label: 'Templates', icon: <LayoutTemplate className="h-4 w-4" /> },
    { href: '/scans/history', label: 'History', icon: <History className="h-4 w-4" /> },
    { href: '/scans/new', label: 'New Scan', icon: <PlusCircle className="h-4 w-4" /> },
  ] : [];

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-card/40 backdrop-blur-xl shadow-2xl">
      <div className="max-w-[1600px] flex h-16 items-center justify-between px-6 mx-auto">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative group overflow-hidden rounded-xl border border-white/10 shadow-emerald-500/10 shadow-lg group-hover:border-emerald-500/30 transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-blue-500/20 to-emerald-400/20 opacity-0 group-hover:opacity-100 transition duration-500"></div>
              <img 
                src="/logo.png" 
                alt="Lynx Scan" 
                className="relative h-10 w-10 object-cover p-[2px] mix-blend-screen"
              />
            </div>
            <span className="text-xl font-black tracking-tighter text-white">
              Lynx <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-cyan-400 to-emerald-400">Scan</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all rounded-lg relative group",
                  pathname === link.href 
                    ? "text-primary bg-primary/10 border border-primary/20" 
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent"
                )}
              >
                {link.icon}
                <span className="relative z-10">{link.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">

          {user ? (
            <>
              {(user.role?.toUpperCase() === 'ADMIN' || user.role?.toUpperCase() === 'USER') && (
                <button
                  onClick={() => router.push('/settings')}
                  className={cn(
                    "flex items-center justify-center p-2 rounded-lg border bg-background/30 backdrop-blur-md text-muted-foreground transition-all hover:bg-accent hover:text-foreground hover:border-primary/50",
                    pathname === '/settings' && "text-primary border-primary/50 bg-primary/10"
                  )}
                  title="System Settings"
                >
                  <Settings className="h-5 w-5" />
                </button>
              )}

              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-primary to-blue-500 text-white shadow-lg transition-all hover:scale-110 active:scale-95",
                    isDropdownOpen && "ring-2 ring-primary ring-offset-2 ring-offset-background"
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
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="absolute right-0 mt-3 w-72 origin-top-right glass-dropdown p-2 z-[100] border-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8),0_0_20px_rgba(168,85,247,0.15)]"
                    >
                      <div className="px-3 py-3 border-b mb-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Account</p>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-semibold truncate">{user.email}</span>
                          <span className="text-[10px] w-fit px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                            {user.role}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <button
                          onClick={() => {
                            router.push('/profile');
                            setIsDropdownOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          <Settings className="h-4 w-4" />
                          Profile Settings
                        </button>
                        
                        {user.role?.toUpperCase() === 'ADMIN' && (
                          <button
                            onClick={() => {
                              router.push('/admin/users');
                              setIsDropdownOpen(false);
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                              pathname === '/admin/users' 
                                ? "bg-primary/10 text-primary" 
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                          >
                            <Users className="h-4 w-4" />
                            User Management
                          </button>
                        )}
                      </div>

                      <div className="mt-1 border-t pt-1">
                        <button
                          onClick={handleLogout}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
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
              <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Login
              </Link>
              <Link href="/login?register=true" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:shadow-[0_0_25px_rgba(168,85,247,0.5)] transition-all">
                Get Started
              </Link>
            </div>
          )}

          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-all hover:bg-white/5 rounded-lg active:scale-95"
            title={isMenuOpen ? "Close Menu" : "Open Menu"}
          >
            {isMenuOpen ? <X className="h-6 w-6 text-primary" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>
      </header>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-x-0 top-16 z-30 md:hidden bg-card/95 backdrop-blur-2xl border-b border-white/10 shadow-2xl p-6"
          >
            <nav className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 text-lg font-semibold transition-all rounded-xl",
                    pathname === link.href 
                      ? "text-primary bg-primary/10 border border-primary/20" 
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent"
                  )}
                >
                  {link.icon}
                  <span>{link.label}</span>
                </Link>
              ))}
              
              {!user && (
                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/5">
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
        )}
      </AnimatePresence>
    </>
  );
}
