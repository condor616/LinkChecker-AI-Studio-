import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { getSession } from '@/lib/auth';
import { Navbar } from '@/components/navbar';
import { ScanSelectionProvider } from '@/components/scans/scan-selection-provider';
import { db } from '@/lib/db';
import { sql, count } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import { DatabaseOffline } from '@/components/database-offline';
import { FirstUserPopup } from '@/components/first-user-popup';

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
  let isFirstUser = false;
  try {
    await db.execute(sql`SELECT 1`);
    
    // Check if it's the first time accessing the app
    const [userCount] = await db.select({ value: count() }).from(users);
    isFirstUser = userCount?.value === 0;
  } catch (error) {
    isDbOnline = false;
  }

  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} dark`}>
      <body className="min-h-screen bg-background font-sans antialiased text-foreground">
        <ScanSelectionProvider hasSession={!!session}>
          <Navbar user={session} />
          <main>
            {isDbOnline ? (
              <>
                {children}
                {isFirstUser && <FirstUserPopup />}
              </>
            ) : <DatabaseOffline />}
          </main>
        </ScanSelectionProvider>
      </body>
    </html>
  );
}
