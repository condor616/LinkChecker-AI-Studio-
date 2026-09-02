import dotenv from 'dotenv';
import path from 'path';
import type { NextConfig } from 'next';

const repoRoot = path.resolve(process.cwd(), '../..');

dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['bullmq', 'ioredis', 'archiver', 'yauzl', 'pg'],
  transpilePackages: ['@lynx/crawler-core', '@lynx/auth', '@lynx/db', '@lynx/backup', 'motion'],
};

export default nextConfig;
