import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();

const pgUser = process.env.POSTGRES_USER || 'lynx_scan';
const pgPassword = process.env.POSTGRES_PASSWORD || 'localpass';
const pgDb = process.env.POSTGRES_DB || 'lynx_scan';
const dbUrl = process.env.DATABASE_URL || `postgres://${pgUser}:${pgPassword}@localhost:5432/${pgDb}`;

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl,
  },
});
