import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();
const envPath = path.join(repoRoot, '.env');
const lynxscanCompose = path.join(repoRoot, 'docker/services/docker-compose.yml');
const geoCompose = path.join(repoRoot, 'apps/lynxgeo/docker/services/docker-compose.yml');
const geoRoot = path.join(repoRoot, 'apps/lynxgeo');
const lynxscanNetwork = 'lynxscan-dev_default';

function dockerNetworkExists(name: string): boolean {
  try {
    execSync(`docker network inspect "${name}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function startLynxScanStack() {
  execSync(`docker compose --env-file .env -f "${lynxscanCompose}" up -d`, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

function resetGeoWorker() {
  try {
    execSync(`docker compose --env-file .env -f "${geoCompose}" down --remove-orphans`, {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  } catch {
    // ignore
  }
  try {
    execSync('docker rm -f lynxgeo-dev-lynxgeo-worker-1', { stdio: 'ignore' });
  } catch {
    // ignore
  }
}

function startGeoWorker() {
  if (!dockerNetworkExists(lynxscanNetwork)) {
    console.log('♻️ Shared Docker network missing; recreating LynxScan services...');
    startLynxScanStack();
  }

  const up = () =>
    execSync(`docker compose --env-file .env -f "${geoCompose}" up -d`, {
      cwd: repoRoot,
      stdio: 'inherit',
    });

  try {
    up();
  } catch {
    console.warn('⚠️ GEO worker failed to attach to Docker network. Recreating it...');
    resetGeoWorker();
    if (!dockerNetworkExists(lynxscanNetwork)) {
      startLynxScanStack();
    }
    up();
  }
}

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

  console.log('🚀 Starting shared db/redis/FlareSolverr and the LynxScan worker...');
  startLynxScanStack();

  console.log('🚀 Starting the Lynx GEO Docker worker...');
  try {
    startGeoWorker();
  } catch (geoError: any) {
    console.warn('\n' + '!'.repeat(64));
    console.warn('⚠️ Lynx GEO Docker worker did not start. LynxScan will still boot.');
    console.warn(geoError?.message || geoError);
    console.warn('!'.repeat(64) + '\n');
  }

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
