'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
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
  Settings
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
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    <header className="sticky top-0 z-40 w-full border-b bg-card/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between px-4 mx-auto">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 flex items-center justify-center group-hover:scale-110 transition-transform">
                <img src="/icon.png" alt="Logo" className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]" />
            </div>
            <span className="text-xl font-bold tracking-tight hidden sm:inline-block">
                LinkChecker <span className="text-primary text-glow-purple">Pro</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-2">
            {navLinks.map((link) => (
              <div key={link.href} className="animated-border-container group/nav h-9 bg-transparent rounded-lg">
                <div className="animated-border-gradient opacity-0 group-hover/nav:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <Link
                  href={link.href}
                  className={cn(
                    "animated-border-inner flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all h-full bg-transparent group-hover/nav:bg-card border-none outline-none",
                    pathname === link.href 
                      ? "text-primary" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {link.icon}
                  <span className="relative z-10">{link.label}</span>
                </Link>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border bg-background/50 text-sm font-medium transition-all hover:bg-accent hover:border-primary/50",
                  isDropdownOpen && "border-primary ring-2 ring-primary/20 bg-accent"
                )}
              >
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <UserIcon className="h-3.5 w-3.5" />
                </div>
                <span className="hidden sm:inline-block">Account</span>
                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", isDropdownOpen && "rotate-180")} />
              </button>

              <AnimatePresence>
                {isDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl border bg-card p-2 shadow-xl ring-1 ring-black/5"
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
        </div>
      </div>
    </header>
  );
}
