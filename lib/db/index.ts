import { getLynxScanDbName, getLynxGeoDbName } from '@lynx/db';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { parseDatabaseUrl } from '../utils/db-command';
import dotenv from 'dotenv';
import path from 'path';

// Force load .env.test if NODE_ENV is test or IS_TESTING is true
if (process.env.NODE_ENV === 'test' || process.env.IS_TESTING === 'true') {
    dotenv.config({ path: path.join(process.cwd(), '.env.test'), override: true });
} else {
    dotenv.config();
}

const pgUser = process.env.POSTGRES_USER || 'lynx_scan';
const pgPassword = process.env.POSTGRES_PASSWORD || 'localpass';
const pgDb = process.env.POSTGRES_DB || 'lynx_scan';
const baseConnectionString = process.env.DATABASE_URL || `postgres://${pgUser}:${pgPassword}@localhost:5432/${pgDb}`;
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
  return getLynxScanDbName(userId);
}

export function getGeoUserDbName(userId: string) {
  return getLynxGeoDbName(userId);
}

function getOrCreateDb(dbName: string) {
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

/**
 * Gets a database instance (Drizzle) for the specified user.
 * If no userId is provided, it returns the main database instance.
 */
export function getDb(userId?: string) {
  const dbName = userId ? getUserDbName(userId) : info.db;
  return getOrCreateDb(dbName);
}

export function getGeoDb(userId: string) {
  return getOrCreateDb(getGeoUserDbName(userId));
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

export async function closeGeoPool(userId: string) {
  const dbName = getGeoUserDbName(userId);
  const pool = pools.get(dbName);
  if (pool) {
    console.log(`Closing GEO pool for user ${userId} (${dbName})`);
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
