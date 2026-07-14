import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

function ensureTestDbName(dbName: string): string {
  return dbName.endsWith('_test') ? dbName : `${dbName}_test`;
}

function normalizeToTestDatabaseUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  const dbName = parsed.pathname.replace(/^\//, '') || 'lynx_scan';
  parsed.pathname = `/${ensureTestDbName(dbName)}`;
  return parsed.toString();
}

function createLocalDbUrlFromPgVars(): string {
  const pgUser = process.env.POSTGRES_USER || 'lynx_scan';
  const pgPassword = process.env.POSTGRES_PASSWORD || 'localpass';
  const pgDb = process.env.POSTGRES_DB || 'lynx_scan';
  const testDb = ensureTestDbName(pgDb);
  return `postgres://${pgUser}:${pgPassword}@localhost:5432/${testDb}`;
}

export function loadTestEnv(cwd: string = process.cwd()): { hasEnvTest: boolean } {
  const envPath = path.resolve(cwd, '.env');
  const envTestPath = path.resolve(cwd, '.env.test');

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }

  const hasEnvTest = fs.existsSync(envTestPath);
  if (hasEnvTest) {
    dotenv.config({ path: envTestPath, override: true });
  }

  const baseUrl = process.env.DATABASE_URL || createLocalDbUrlFromPgVars();
  process.env.DATABASE_URL = normalizeToTestDatabaseUrl(baseUrl);

  return { hasEnvTest };
}

export function getTestDatabaseUrl(): string {
  const baseUrl = process.env.DATABASE_URL || createLocalDbUrlFromPgVars();
  return normalizeToTestDatabaseUrl(baseUrl);
}
