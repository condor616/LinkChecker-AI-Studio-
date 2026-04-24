import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('Checking Docker status wrapper...');

try {
  // Check if .env exists
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.warn('\n' + '!'.repeat(64));
    console.warn('⚠️ WARNING: .env file not found!');
    console.warn('The system will attempt to proceed, but Docker Compose may fail');
    console.warn('if it relies on environment variables defined in .env.');
    console.warn('Please run: cp .env.example .env');
    console.warn('!'.repeat(64) + '\n');
  }

  // Check if Docker daemon is running
  console.log('🔍 Checking if Docker daemon is responsive...');
  try {
    execSync('docker info', { stdio: 'ignore' });
  } catch (dockerError: any) {
    throw new Error(`Docker daemon is not responsive. Make sure Docker Desktop is running. (Error: ${dockerError.message})`);
  }
  
  console.log('🚀 Starting backend services (PostgreSQL, Redis) using Docker Compose...');
  // Start the services in detached mode
  try {
    execSync('docker compose --env-file .env -f docker/services/docker-compose.yml up -d', { stdio: 'inherit' });
  } catch (composeError: any) {
    throw new Error(`Docker Compose failed to start services. (Error: ${composeError.message})`);
  }
  
  console.log('✅ Backend services started gracefully.');

  console.log('📦 Ensuring database schema is up to date...');
  let retries = 5;
  while (retries > 0) {
    try {
      execSync('npx drizzle-kit push', { stdio: 'inherit' });
      console.log('✅ Database schema is up to date.');
      break;
    } catch (error) {
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
  console.error('PostgreSQL and Redis services will not be brought up automatically.');
  console.error('The Next.js application will continue booting, but database operations');
  console.error('will fail unless you have another instance running.');
  console.error('='.repeat(64) + '\n');
  process.exit(1);
}
