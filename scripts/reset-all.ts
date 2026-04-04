import { Pool } from 'pg';
import { parseDatabaseUrl } from '../lib/utils/db-command';
import fs from 'fs';
import path from 'path';

const baseConnectionString = process.env.DATABASE_URL || 'postgres://lynx_scan:localpass@localhost:5432/lynx_scan';
const info = parseDatabaseUrl(baseConnectionString);

async function resetAll() {
  const adminPool = new Pool({
    connectionString: `postgres://${info.user}:${info.pass}@${info.host}:${info.port}/postgres`,
  });

  try {
    console.log('--- Database Reset Starting ---');

    // 1. Identify all lynx_scan_* databases
    const res = await adminPool.query("SELECT datname FROM pg_database WHERE datname LIKE 'lynx_scan_%'");
    const dbsToDrop = res.rows.map(row => row.datname);

    console.log(`Found ${dbsToDrop.length} user databases to drop.`);

    for (const dbName of dbsToDrop) {
      console.log(`Dropping database: ${dbName}...`);
      
      await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      console.log(`✅ Database ${dbName} dropped.`);
    }

    // 2. Wipe main database tables
    console.log(`Resetting main database: ${info.db}...`);
    const mainPool = new Pool({
      connectionString: baseConnectionString,
    });

    try {
      // We drop the public schema and recreate it to be absolutely sure
      await mainPool.query('DROP SCHEMA public CASCADE;');
      await mainPool.query('CREATE SCHEMA public;');
      await mainPool.query('GRANT ALL ON SCHEMA public TO public;');
      await mainPool.query(`GRANT ALL ON SCHEMA public TO ${info.user};`);
      
      console.log('✅ Main database schema reset.');
    } finally {
      await mainPool.end();
    }

    // 3. Wipe filesystem backups
    const backupsDir = path.join(process.cwd(), 'data', 'backups');
    if (fs.existsSync(backupsDir)) {
      console.log('Cleaning up filesystem backups...');
      const files = fs.readdirSync(backupsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(backupsDir, file));
        console.log(`Deleted backup: ${file}`);
      }
      console.log('✅ Backups directory cleared.');
    }

    console.log('--- All Data Wiped Successfully ---');
    console.log('Next step: Run `npx drizzle-kit push` to recreate tables.');
  } catch (error) {
    console.error('Failed to reset all data:', error);
  } finally {
    await adminPool.end();
  }
}

resetAll();
