import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const geoRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(geoRoot, '../..');
const envPath = path.join(repoRoot, '.env');
const sharedCompose = path.join(repoRoot, 'docker/services/docker-compose.yml');
const geoCompose = path.join(geoRoot, 'docker/services/docker-compose.yml');

console.log('Checking Docker status wrapper...');

try {
  if (!fs.existsSync(envPath)) {
    console.warn('\n' + '!'.repeat(64));
    console.warn('⚠️ WARNING: .env file not found at repo root!');
    console.warn('The system will attempt to proceed, but Docker Compose may fail');
    console.warn('if it relies on environment variables defined in .env.');
    console.warn('Please run: cp .env.example .env');
    console.warn('!'.repeat(64) + '\n');
  }

  console.log('🔍 Checking if Docker daemon is responsive...');
  try {
    execSync('docker info', { stdio: 'ignore' });
  } catch (dockerError: any) {
    throw new Error(`Docker daemon is not responsive. Make sure Docker Desktop is running. (Error: ${dockerError.message})`);
  }

  console.log('🚀 Starting backend services (PostgreSQL, Redis) using Docker Compose...');
  try {
    console.log('🧹 Stopping any existing production GEO containers...');
    execSync('docker compose down', { cwd: geoRoot, stdio: 'ignore' });
  } catch {
    // ignore
  }

  try {
    execSync(`docker compose --env-file .env -f "${sharedCompose}" up -d db redis`, {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  } catch (composeError: any) {
    throw new Error(`Shared Docker Compose failed to start db/redis. (Error: ${composeError.message})`);
  }

  console.log('🧹 Stopping leftover host GEO workers so Docker is the only consumer...');
  try {
    const ps = execSync('ps -ax -o pid=,command=', { encoding: 'utf8' });
    let killed = 0;
    for (const line of ps.split('\n')) {
      const match = line.match(/^\s*(\d+)\s+(.*)$/);
      if (!match) continue;
      const pid = match[1];
      const cmd = match[2];
      if (pid === String(process.pid)) continue;
      const isHostGeo =
        cmd.includes('worker:lynxgeo') ||
        (cmd.includes('with-deps.cjs') && cmd.includes('worker/index.ts'));
      if (!isHostGeo) continue;
      console.log(`💀 Killing host GEO worker ${pid}: ${cmd.slice(0, 120)}`);
      try {
        execSync(`kill ${pid}`);
        killed += 1;
      } catch {
        // ignore
      }
    }
    if (killed > 0) execSync('sleep 2');
  } catch {
    // ps may be unavailable in some environments
  }

  console.log('🚀 Starting Lynx GEO Docker worker...');
  try {
    execSync(`docker compose --env-file "${envPath}" -f "${geoCompose}" up -d`, {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  } catch (composeError: any) {
    throw new Error(`GEO worker Compose failed to start. (Error: ${composeError.message})`);
  }

  console.log('✅ Backend services started gracefully.');

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
        console.error('❌ Failed to push schema after multiple attempts. You may need to run `npx drizzle-kit push` manually.');
      } else {
        console.log('⏳ Waiting for database to be ready before pushing schema...');
        execSync('sleep 2');
      }
    }
  }
} catch (error: any) {
  console.error('\n' + '='.repeat(64));
  console.error(`❌ ERROR: ${error.message || 'Unknown error occurred during setup.'}`);
  console.error('PostgreSQL, Redis, and the GEO worker will not be brought up automatically.');
  console.error('The Next.js application will continue booting, but audits will stay queued');
  console.error('unless the worker and Redis are running.');
  console.error('='.repeat(64) + '\n');
  process.exit(1);
}
