import { execSync } from 'child_process';

console.log('Checking Docker status wrapper...');

try {
  // Check if Docker daemon is running
  console.log('🔍 Checking if Docker daemon is responsive...');
  execSync('docker info', { stdio: 'ignore' });
  
  console.log('🚀 Starting backend services (PostgreSQL, Redis) using Docker Compose...');
  // Start the services in detached mode
  // Using 'docker compose' (V2) instead of 'docker-compose' (V1)
  execSync('docker compose --env-file .env -f docker/services/docker-compose.yml up -d', { stdio: 'inherit' });
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
} catch (error) {
  console.error('\n' + '='.repeat(64));
  console.error('❌ ERROR: Docker is not running, not available, or failed to start.');
  console.error('PostgreSQL and Redis services will not be brought up automatically.');
  console.error('The Next.js application will continue booting, but database operations');
  console.error('will fail unless you have another instance running.');
  console.error('='.repeat(64) + '\n');
  process.exit(1);
}
