import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { getSession } from '@/lib/auth';
import { Navbar } from '@/components/navbar';
import { ScanSelectionProvider } from '@/components/scans/scan-selection-provider';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { DatabaseOffline } from '@/components/database-offline';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Lynx Scan',
  description: 'High-performance digital integrity and link monitoring',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  let isDbOnline = true;
  try {
    await db.execute(sql`SELECT 1`);
  } catch (error) {
    isDbOnline = false;
  }

  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} dark`}>
      <body className="min-h-screen bg-background font-sans antialiased text-foreground">
        <ScanSelectionProvider>
          <Navbar user={session} />
          <main>
            {isDbOnline ? children : <DatabaseOffline />}
          </main>
        </ScanSelectionProvider>
      </body>
    </html>
  );
}
