import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { hasProductAccess } from '@lynx/auth';
import { getSession } from '@/lib/auth';
import { Navbar } from '@/components/navbar';
import { ThemeProvider } from '@/components/theme-provider';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Lynx GEO',
  description: 'AI discoverability and agent-readiness audits',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const canUseGeo = !!(session && hasProductAccess(session.productAccess, 'lynxgeo'));
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem('theme');const d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&d))document.documentElement.setAttribute('data-theme','dark');}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased text-foreground">
        <ThemeProvider>
          <Navbar user={session} canUseGeo={canUseGeo} />
          <main>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
