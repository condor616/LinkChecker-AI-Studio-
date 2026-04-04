import { beforeAll, afterAll } from 'vitest';
import { closeAllPools } from '@/lib/db';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.test
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

beforeAll(async () => {
  // Any global setup before tests run
  console.log('🚀 Starting Vitest suite...');
});

afterAll(async () => {
  // Cleanup connections
  console.log('🧹 Cleaning up Vitest suite...');
  await closeAllPools();
});
