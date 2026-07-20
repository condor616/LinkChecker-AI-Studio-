'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

export function FirstUserPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Only show if we are NOT on the setup or login page
    if (pathname !== '/setup' && pathname !== '/login') {
      const timer = setTimeout(() => setIsOpen(true), 500);
      return () => clearTimeout(timer);
    } else {
      setIsOpen(false);
    }
  }, [pathname]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-md p-8 overflow-hidden relative bg-card/90 border border-white/10 shadow-2xl rounded-2xl"
          >
            <div className="absolute top-0 right-[-10%] w-32 h-32 bg-primary/20 blur-[50px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-10%] left-[-10%] w-32 h-32 bg-emerald-500/20 blur-[50px] rounded-full pointer-events-none" />
            
            <div className="relative z-10 flex flex-col items-center text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <ShieldAlert className="w-8 h-8 text-emerald-500" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-black tracking-tight text-foreground">System Uninitialized</h2>
                <p className="text-muted-foreground text-sm">
                  Welcome to Lynx Scan! It looks like there are no users in the database yet. 
                  You must create an account to begin, and this first account will automatically be granted <span className="font-bold text-primary">Administrator</span> privileges.
                </p>
              </div>

              <Link href="/login?register=true" onClick={() => setIsOpen(false)} className="w-full relative group inline-flex h-12 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-primary to-emerald-600 px-8 font-medium text-primary-foreground shadow-[0_4px_14px_0_rgba(168,85,247,0.39)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.23)] hover:scale-[1.02] transition-all">
                  <span className="mr-2">Register your first user</span>
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
