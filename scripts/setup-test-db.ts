import { execSync } from 'child_process';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

const dbUrl = process.env.DATABASE_URL || 'postgres://lynx_scan:localpass@localhost:5432/lynx_scan_test';
const url = new URL(dbUrl);
const dbName = url.pathname.slice(1);
url.pathname = '/postgres'; // Connect to default postgres DB to create the test DB

async function setup() {
  console.log(`Setting up test database: ${dbName}...`);
  
  const client = new Client({
    connectionString: url.toString(),
  });

  try {
    await client.connect();
    
    // Check if DB exists
    const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = '${dbName}'`);
    if (res.rowCount === 0) {
      console.log(`Creating database ${dbName}...`);
      await client.query(`CREATE DATABASE ${dbName}`);
    } else {
      console.log(`Database ${dbName} already exists.`);
    }
  } catch (err) {
    console.error('Error creating test database:', err);
    process.exit(1);
  } finally {
    await client.end();
  }

  // Push schema using drizzle-kit
  console.log('Pushing schema to test database...');
  try {
    execSync('npx drizzle-kit push', { 
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: dbUrl }
    });
    console.log('Schema pushed successfully.');
  } catch (err) {
    console.error('Error pushing schema:', err);
    process.exit(1);
  }
}

setup();
