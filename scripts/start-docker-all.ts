import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();
const envPath = path.join(repoRoot, '.env');
const lynxscanCompose = path.join(repoRoot, 'docker/services/docker-compose.yml');
const geoCompose = path.join(repoRoot, 'apps/lynxgeo/docker/services/docker-compose.yml');
const geoRoot = path.join(repoRoot, 'apps/lynxgeo');

console.log('Checking Docker status wrapper (all apps)...');

try {
  if (!fs.existsSync(envPath)) {
    console.warn('\n' + '!'.repeat(64));
    console.warn('⚠️ WARNING: .env file not found!');
    console.warn('Please run: cp .env.example .env');
    console.warn('!'.repeat(64) + '\n');
  }

  console.log('🔍 Checking if Docker daemon is responsive...');
  execSync('docker info', { stdio: 'ignore' });

  try {
    console.log('🧹 Stopping any existing production containers...');
    execSync('docker compose down', { cwd: repoRoot, stdio: 'ignore' });
    execSync('docker compose down', { cwd: geoRoot, stdio: 'ignore' });
  } catch {
    // ignore
  }

  console.log('🚀 Starting shared db/redis and the LynxScan worker...');
  execSync(`docker compose --env-file .env -f "${lynxscanCompose}" up -d`, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  console.log('🚀 Starting the Lynx GEO Docker worker...');
  execSync(`docker compose --env-file .env -f "${geoCompose}" up -d`, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  console.log('✅ All backend services started.');

  console.log('📦 Ensuring database schema is up to date...');
  let retries = 5;
  while (retries > 0) {
    try {
      execSync('npx drizzle-kit push', { cwd: repoRoot, stdio: 'inherit' });
      console.log('✅ Database schema is up to date.');
      break;
    } catch {
      retries--;
      if (retries === 0) {
        console.error('❌ Failed to push schema after multiple attempts.');
      } else {
        console.log('⏳ Waiting for database to be ready before pushing schema...');
        execSync('sleep 2');
      }
    }
  }
} catch (error: any) {
  console.error('\n' + '='.repeat(64));
  console.error(`❌ ERROR: ${error.message || 'Unknown error occurred during setup.'}`);
  console.error('='.repeat(64) + '\n');
  process.exit(1);
}
