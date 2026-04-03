import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgres://linkchecker:localpass@localhost:5432/linkchecker';

// Create a Postgres connection pool
const pool = new Pool({
  connectionString,
});

export const db = drizzle(pool, { schema });

pool.on('error', (err) => {
  console.error('Unexpected error on idle client (db connection lost).');
});
