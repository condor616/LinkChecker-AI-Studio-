import { Client } from 'pg';
import { getTestDatabaseUrl, loadTestEnv } from './test-env';

const { hasEnvTest } = loadTestEnv();
if (!hasEnvTest) {
  console.warn('⚠️ .env.test not found; using .env credentials with an auto-suffixed _test database.');
}

const dbUrl = getTestDatabaseUrl();
const url = new URL(dbUrl);
url.pathname = '/postgres'; // Connect to default postgres DB to drop the test databases

async function teardown() {
  console.log('Cleaning up test databases...');
  
  const client = new Client({
    connectionString: url.toString(),
  });

  try {
    await client.connect();
    
    // Identify all *_test databases
    const res = await client.query("SELECT datname FROM pg_database WHERE datname LIKE '%_test'");
    const dbsToDrop = res.rows.map(row => row.datname);

    console.log(`Found ${dbsToDrop.length} test databases to drop.`);

    for (const dbName of dbsToDrop) {
      console.log(`Dropping database: ${dbName}...`);
      await client.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    }

    console.log('Teardown complete.');
  } catch (err) {
    console.error('Error during test database teardown:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

teardown();
