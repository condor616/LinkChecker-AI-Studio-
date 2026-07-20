import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[10%] right-[-5%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-2xl w-full text-center space-y-8 glass-vibrant p-12 md:p-20 rounded-[40px] border border-white/10 shadow-2xl">
        <div className="text-8xl md:text-9xl font-black tracking-tighter opacity-20 absolute -top-10 left-1/2 -translate-x-1/2 select-none">
          404
        </div>
        
        <div className="space-y-4">
          <div className="text-6xl mb-6">🐾</div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-tight">
            Oops! Playing <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-cyan-400 to-emerald-400">Hide and Seek.</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-md mx-auto leading-relaxed">
            Our Lynx looked everywhere, but it seems this resource has escaped into the digital wilderness.
          </p>
        </div>

        <div className="pt-8">
          <Button size="lg" asChild className="px-10 h-14 text-lg font-bold bg-gradient-to-r from-primary to-indigo-600 hover:shadow-[0_0_30px_rgba(168,85,247,0.5)] transition-all rounded-xl border-none">
            <Link href="/" className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              Return to Safety
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
