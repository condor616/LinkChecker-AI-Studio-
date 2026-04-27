import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './index';
import path from 'path';

let isReady = false;

export function isDbReady() {
  return isReady;
}

export async function runMigrations() {
  if (isReady) return;
  
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    console.log(`⏳ Running database migrations (Attempt ${attempts + 1}/${maxAttempts})...`);
    try {
      const migrationsPath = path.join(process.cwd(), 'drizzle');
      console.log(`Checking migrations at: ${migrationsPath}`);
      
      await migrate(db, { migrationsFolder: migrationsPath });
      isReady = true;
      console.log('✅ Migrations completed successfully.');
      return;
    } catch (error: any) {
      if (error.code === 'EAI_AGAIN' || error.message.includes('getaddrinfo')) {
        console.warn('⚠️ Database hostname "db" not resolvable yet. Retrying in 2s...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      } else {
        console.error('❌ Migration failed:', error);
        return; // Don't block forever on other errors
      }
    }
  }
}
