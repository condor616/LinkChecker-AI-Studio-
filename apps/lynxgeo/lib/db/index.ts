import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { getLynxGeoDbName } from '@lynx/db';
import * as schema from './schema';

dotenv.config({ path: path.join(process.cwd(), '../../.env'), quiet: true });
dotenv.config({ quiet: true });

const pgUser = process.env.POSTGRES_USER || 'lynx_scan';
const pgPassword = process.env.POSTGRES_PASSWORD || 'localpass';
const pgDb = process.env.POSTGRES_DB || 'lynx_scan';

function inDocker() {
  try {
    return fs.existsSync('/.dockerenv');
  } catch {
    return false;
  }
}

/**
 * Host Next uses localhost:5432 (LynxScan docker port publish).
 * Inside a container, localhost is the container itself — rewrite to the
 * LynxScan db service (`db` / POSTGRES_HOST) or host.docker.internal.
 */
function parseBaseUrl() {
  const base = process.env.DATABASE_URL || `postgres://${pgUser}:${pgPassword}@localhost:5432/${pgDb}`;
  const u = new URL(base);
  if (inDocker() && ['localhost', '127.0.0.1', '::1'].includes(u.hostname)) {
    u.hostname = process.env.POSTGRES_HOST || 'host.docker.internal';
    if (u.hostname === 'db' || u.hostname === 'host.docker.internal') {
      u.port = u.port || '5432';
    }
  }
  return u;
}

const u = parseBaseUrl();

const pools = new Map<string, Pool>();

function conn(dbName: string) {
  return `postgres://${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}@${u.hostname}:${u.port || '5432'}/${dbName}`;
}

function getOrCreate(dbName: string) {
  if (!pools.has(dbName)) {
    const pool = new Pool({ connectionString: conn(dbName) });
    pools.set(dbName, pool);
  }
  return drizzle(pools.get(dbName)!, { schema });
}

/** Hostname:port only — never include passwords. */
export function postgresTarget() {
  return `${u.hostname}:${u.port || '5432'}`;
}

export function connectionStringFor(dbName: string) {
  return conn(dbName);
}

export function getCentralDb() {
  return getOrCreate(u.pathname.replace(/^\//, '') || pgDb);
}

export function getGeoDb(userId: string) {
  return getOrCreate(getLynxGeoDbName(userId));
}

export const db = getCentralDb();
