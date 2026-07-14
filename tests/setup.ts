import { beforeAll, afterAll } from 'vitest';
import { closeAllPools } from '@/lib/db';
import { loadTestEnv } from '@/scripts/test-env';

loadTestEnv();

beforeAll(async () => {
  // Any global setup before tests run
  console.log('🚀 Starting Vitest suite...');
});

afterAll(async () => {
  // Cleanup connections
  console.log('🧹 Cleaning up Vitest suite...');
  await closeAllPools();
});
