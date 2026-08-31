import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    fileParallelism: false,
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    alias: {
      '@': path.resolve(__dirname, './'),
      '@lynx/crawler-core/url': path.resolve(__dirname, './packages/crawler-core/src/url.ts'),
      '@lynx/crawler-core': path.resolve(__dirname, './packages/crawler-core/src/index.ts'),
      '@lynx/auth': path.resolve(__dirname, './packages/auth/src/index.ts'),
      '@lynx/db': path.resolve(__dirname, './packages/db/src/index.ts'),
    },
  },
});
