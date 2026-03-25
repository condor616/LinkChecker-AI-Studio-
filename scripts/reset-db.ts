import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'sqlite.db');

if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('Database deleted.');
} else {
  console.log('Database does not exist.');
}

// Re-initialize
require('./lib/db/index');
console.log('Database reset complete.');
