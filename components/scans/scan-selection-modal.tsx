'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Globe, Target, ArrowRight, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useScanSelection } from './scan-selection-provider';
import { ScanWizard } from './scan-wizard';

interface ScanSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ScanSelectionModal({ isOpen, onClose }: ScanSelectionModalProps) {
  const router = useRouter();
  const { showWizard, setShowWizard } = useScanSelection();

  const handleSelect = (mode: 'normal' | 'targeted') => {
    onClose();
    if (mode === 'targeted') {
      router.push('/scans/new?target=true');
    } else {
      router.push('/scans/new');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-xl"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className={cn(
                "relative w-full overflow-hidden rounded-[32px] border border-white/10 bg-[#0c0c0e] shadow-2xl shadow-primary/20 transition-all duration-500",
                showWizard ? "max-w-2xl" : "max-w-4xl"
            )}
          >
            {/* Header Decoration */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary via-cyan-400 to-emerald-400" />
            
            {!showWizard && (
              <button
                onClick={onClose}
                className="absolute right-6 top-6 p-2 text-muted-foreground hover:text-white hover:bg-white/10 rounded-full transition-all z-10"
              >
                <X className="h-6 w-6" />
              </button>
            )}

            <AnimatePresence mode="wait">
              {showWizard ? (
                <motion.div
                  key="wizard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full"
                >
                  <ScanWizard onExit={onClose} />
                </motion.div>
              ) : (
                <motion.div
                  key="selection"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-8 md:p-12"
                >
              <div className="text-center space-y-4 mb-12">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest">
                  <Zap className="h-3 w-3 fill-current" /> Initialize engine
                </div>
                <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-white">
                  Choose your <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-400">Scan Mode</span>
                </h2>
                <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                  Select the crawling strategy that best fits your current requirements. 
                  High-speed verification or precision asset auditing.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6 md:gap-8">
                {/* Normal Scan Card */}
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <Card 
                    className="group relative h-full cursor-pointer overflow-hidden border-white/5 bg-white/[0.02] transition-all hover:border-primary/50 hover:bg-primary/[0.03]"
                    onClick={() => handleSelect('normal')}
                  >
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Globe className="h-24 w-24 text-primary" />
                    </div>
                    
                    <CardHeader className="p-8">
                      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform mb-6">
                        <Globe className="h-7 w-7" />
                      </div>
                      <CardTitle className="text-2xl font-bold text-white mb-3">Normal Scan</CardTitle>
                      <CardDescription className="text-slate-400 text-base leading-relaxed">
                        Comprehensive site-wide audit. Recursively crawls your entire domain to verify every internal and external connection.
                      </CardDescription>
                    </CardHeader>
                    
                    <CardContent className="p-8 pt-0">
                      <ul className="space-y-3 mb-8">
                        {['Recursive Discovery', 'Site-wide Coverage', 'Automated Mapping'].map((item) => (
                          <li key={item} className="flex items-center gap-2 text-sm text-slate-500">
                            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                            {item}
                          </li>
                        ))}
                      </ul>
                      
                      <Button className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 rounded-xl group-hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all">
                        Launch Normal Scan
                        <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Targeted Scan Card */}
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <Card 
                    className="group relative h-full cursor-pointer overflow-hidden border-white/5 bg-white/[0.02] transition-all hover:border-emerald-500/50 hover:bg-emerald-500/[0.03]"
                    onClick={() => handleSelect('targeted')}
                  >
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Target className="h-24 w-24 text-emerald-400" />
                    </div>

                    <CardHeader className="p-8">
                      <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform mb-6">
                        <Target className="h-7 w-7" />
                      </div>
                      <CardTitle className="text-2xl font-bold text-white mb-3">Targeted Scan</CardTitle>
                      <CardDescription className="text-slate-400 text-base leading-relaxed">
                        Precision asset verification. Focuses exclusively on a list of specific URLs, PDFs, or images for immediate feedback.
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="p-8 pt-0">
                      <ul className="space-y-3 mb-8">
                        {['Zero Recursive Noise', 'PDF & Image Auditing', 'Instant Feedback'].map((item) => (
                          <li key={item} className="flex items-center gap-2 text-sm text-slate-500">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {item}
                          </li>
                        ))}
                      </ul>

                      <Button className="w-full h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-500 rounded-xl group-hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all border-none">
                        Launch Targeted Scan
                        <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
                </div>
              </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
