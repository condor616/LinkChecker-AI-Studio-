import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  output: 'standalone',
  serverExternalPackages: ['archiver', 'yauzl', 'pg'],
  transpilePackages: ['motion', '@lynx/crawler-core', '@lynx/auth', '@lynx/db', '@lynx/backup'],
  experimental: {
    // Backups are pg_dump zips that can grow large; middleware buffers the body before route handlers.
    middlewareClientMaxBodySize: '500mb',
  },
};

export default nextConfig;
