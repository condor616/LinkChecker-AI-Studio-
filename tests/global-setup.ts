import { execSync } from 'child_process';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

export async function setup() {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

  const dbUrl = process.env.DATABASE_URL || 'postgres://lynx_scan:localpass@localhost:5432/lynx_scan_test';
  const url = new URL(dbUrl);
  const dbName = url.pathname.slice(1);
  url.pathname = '/postgres';

  console.log('🚀 [Global Setup] Cleaning up test databases...');
  
  const client = new Client({
    connectionString: url.toString(),
  });

  try {
    await client.connect();
    
    // Drop all test databases
    const res = await client.query("SELECT datname FROM pg_database WHERE datname LIKE '%_test'");
    const dbsToDrop = res.rows.map(row => row.datname);

    for (const dName of dbsToDrop) {
      console.log(`🧹 [Global Setup] Dropping database: ${dName}...`);
      await client.query(`DROP DATABASE IF EXISTS ${dName} WITH (FORCE)`);
    }

    console.log(`✨ [Global Setup] Creating fresh test database: ${dbName}...`);
    await client.query(`CREATE DATABASE ${dbName}`);
    
  } catch (err) {
    console.error('❌ [Global Setup] Error:', err);
    throw err;
  } finally {
    await client.end();
  }

  // Push schema
  console.log('🏗️ [Global Setup] Pushing schema to test database...');
  try {
    execSync('npx drizzle-kit push', { 
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: dbUrl }
    });
    console.log('✅ [Global Setup] Schema pushed successfully.');
  } catch (err) {
    console.error('❌ [Global Setup] Error pushing schema:', err);
    throw err;
  }
}

export async function teardown() {
  console.log('🧹 [Global Teardown] Cleaning up...');
  // Optional: Add logic to drop databases on exit if desired, 
  // but keeping them for 'test:watch' is often better.
}
