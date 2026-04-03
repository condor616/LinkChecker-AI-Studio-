import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import path from 'path';

const connectionString = process.env.DATABASE_URL || 'postgres://linkchecker:localpass@localhost:5432/linkchecker';

const pool = new Pool({ connectionString });
const db = drizzle(pool);

async function resetDb() {
  try {
    console.log('Resetting public schema...');
    await db.execute('DROP SCHEMA public CASCADE;');
    await db.execute('CREATE SCHEMA public;');
    console.log('✅ PostgreSQL database reset complete (public schema recreated).');
    console.log('Run migrations (`npx drizzle-kit push`) to rebuild your tables.');
  } catch (error) {
    console.error('Failed to reset database:', error);
  } finally {
    await pool.end();
  }
}

resetDb();
