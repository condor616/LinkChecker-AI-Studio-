import { execSync } from 'child_process';

console.log('Checking Docker status wrapper...');

try {
  // Check if Docker daemon is running
  execSync('docker info', { stdio: 'ignore' });
  
  console.log('✅ Docker is running. Starting backend services (PostgreSQL, Redis)...');
  // Start the services in detached mode
  execSync('docker-compose --env-file .env -f docker/services/docker-compose.yml up -d', { stdio: 'inherit' });
  console.log('✅ Backend services started gracefully.');
} catch (error) {
  console.log('\n================================================================');
  console.log('⚠️  WARNING: Docker is not running, not available, or failed to start.');
  console.log('PostgreSQL and Redis services will not be brought up automatically.');
  console.log('The Next.js application will continue booting, but database operations');
  console.log('will fail unless you have another instance running.');
  console.log('================================================================\n');
}
