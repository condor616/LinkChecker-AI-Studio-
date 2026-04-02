import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

// Resolve the persistent data directory
// In Next.js standalone mode, process.cwd() might point inside .next/standalone
// We want to consistently point to the project root's data folder.
function resolveDataDir() {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR, 'data');
  
  const cwd = process.cwd();
  // If we're running from inside .next/standalone, go up to find the real root
  if (cwd.includes('.next' + path.sep + 'standalone')) {
    return path.resolve(cwd, '..', '..', 'data');
  }
  return path.resolve(cwd, 'data');
}

const dataDir = resolveDataDir();

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure we use the absolute path to the sqlite.db
const dbPath = path.join(dataDir, 'sqlite.db');
console.log(`Database initialized at: ${dbPath}`);

const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

// Simple migration runner (for development/local use)
export function initDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'PENDING',
      max_jobs INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'IDLE',
      config TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      scan_id TEXT NOT NULL,
      url TEXT NOT NULL,
      parent_url TEXT,
      status TEXT NOT NULL,
      status_code INTEGER,
      error TEXT,
      type TEXT,
      snippet TEXT,
      depth INTEGER NOT NULL DEFAULT 0,
      checked_at INTEGER,
      FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

initDb();
