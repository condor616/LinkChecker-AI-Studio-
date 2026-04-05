import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { parseDatabaseUrl } from '../utils/db-command';
import dotenv from 'dotenv';
import path from 'path';

// Force load .env.test if NODE_ENV is test
if (process.env.NODE_ENV === 'test') {
    dotenv.config({ path: path.join(process.cwd(), '.env.test'), override: true });
} else {
    dotenv.config();
}

const baseConnectionString = process.env.DATABASE_URL || 'postgres://lynx_scan:localpass@localhost:5432/lynx_scan';
const info = parseDatabaseUrl(baseConnectionString);

// Cache for connection pools: dbName -> Pool
const pools: Map<string, Pool> = new Map();

/**
 * Returns a connection string for a specific database name, 
 * using the credentials from the base connection string.
 */
function getConnectionString(dbName: string) {
  return `postgres://${info.user}:${info.pass}@${info.host}:${info.port}/${dbName}`;
}

/**
 * Returns the database name for a specific user, 
 * including the test suffix if in test mode.
 */
export function getUserDbName(userId: string) {
  const suffix = process.env.NODE_ENV === 'test' ? '_test' : '';
  return `lynx_scan_${userId.toLowerCase().replace(/[^a-z0-9]/g, '_')}${suffix}`;
}

/**
 * Gets a database instance (Drizzle) for the specified user.
 * If no userId is provided, it returns the main database instance.
 */
export function getDb(userId?: string) {
  const dbName = userId ? getUserDbName(userId) : info.db;

  if (!pools.has(dbName)) {
    console.log(`Creating new connection pool for database: ${dbName}`);
    const pool = new Pool({
      connectionString: getConnectionString(dbName),
    });

    pool.on('error', (err) => {
      console.error(`Unexpected error on idle client for ${dbName}:`, err);
    });

    pools.set(dbName, pool);
  }

  return drizzle(pools.get(dbName)!, { schema });
}

// Backward compatibility for existing code that uses 'db'
// Note: This will default to the main database.
export const db = getDb();

/**
 * Closes a specific user's connection pool.
 */
export async function closePool(userId: string) {
  const dbName = getUserDbName(userId);
  const pool = pools.get(dbName);
  if (pool) {
    console.log(`Closing pool for user ${userId} (${dbName})`);
    await pool.end();
    pools.delete(dbName);
  }
}

/**
 * Closes all active connection pools. Useful for testing or shutdown.
 */
export async function closeAllPools() {
  for (const [dbName, pool] of pools.entries()) {
    console.log(`Closing pool for ${dbName}`);
    await pool.end();
  }
  pools.clear();
}
