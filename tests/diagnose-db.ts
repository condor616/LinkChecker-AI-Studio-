import { getDb } from '../lib/db';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import * as path from 'path';

async function testConnection() {
  dotenv.config({ path: path.join(__dirname, '../.env') });
  console.log('Testing connection to:', process.env.DATABASE_URL);
  
  try {
    const db = getDb();
    const result = await db.execute(sql`SELECT 1`);
    console.log('Connection successful!', result);
    process.exit(0);
  } catch (err) {
    console.error('Connection failed:', err);
    process.exit(1);
  }
}

testConnection();
