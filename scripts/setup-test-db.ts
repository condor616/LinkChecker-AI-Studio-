import { execSync } from 'child_process';
import { Client } from 'pg';
import { getTestDatabaseUrl, loadTestEnv } from './test-env';

const { hasEnvTest } = loadTestEnv();
if (!hasEnvTest) {
  console.warn('⚠️ .env.test not found; using .env credentials with an auto-suffixed _test database.');
}

const dbUrl = getTestDatabaseUrl();
const url = new URL(dbUrl);
const dbName = url.pathname.slice(1);
url.pathname = '/postgres'; // Connect to default postgres DB to create the test DB

async function setup() {
  console.log('Cleaning up old test databases...');
  
  const client = new Client({
    connectionString: url.toString(),
  });

  try {
    await client.connect();
    
    // 1. Identify all *_test databases
    const res = await client.query("SELECT datname FROM pg_database WHERE datname LIKE '%_test'");
    const dbsToDrop = res.rows.map(row => row.datname);

    console.log(`Found ${dbsToDrop.length} test databases to drop.`);

    for (const dName of dbsToDrop) {
      console.log(`Dropping database: ${dName}...`);
      await client.query(`DROP DATABASE IF EXISTS ${dName} WITH (FORCE)`);
    }

    // 2. Create main test database
    console.log(`Creating fresh test database: ${dbName}...`);
    await client.query(`CREATE DATABASE ${dbName}`);
    
  } catch (err) {
    console.error('Error during test database setup:', err);
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
