import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@lynx/crawler-core/url': path.resolve(__dirname, './packages/crawler-core/src/url.ts'),
      '@lynx/crawler-core': path.resolve(__dirname, './packages/crawler-core/src/index.ts'),
      '@lynx/auth': path.resolve(__dirname, './packages/auth/src/index.ts'),
      '@lynx/db': path.resolve(__dirname, './packages/db/src/index.ts'),
      '@lynx/backup/backup': path.resolve(__dirname, './packages/backup/src/backup.ts'),
      '@lynx/backup/db-command': path.resolve(__dirname, './packages/backup/src/db-command.ts'),
      '@lynx/backup/manifest': path.resolve(__dirname, './packages/backup/src/manifest.ts'),
      '@lynx/backup/paths': path.resolve(__dirname, './packages/backup/src/paths.ts'),
      '@lynx/backup': path.resolve(__dirname, './packages/backup/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    fileParallelism: false,
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
