import { execSync } from 'child_process';

console.log('Stopping Docker wrapper...');

try {
  // Check if Docker daemon is running
  execSync('docker info', { stdio: 'ignore' });
  
  console.log('🛑 Stopping backend services (PostgreSQL, Redis)...');
  // Stop the services
  execSync('docker-compose --env-file .env -f docker/services/docker-compose.yml down', { stdio: 'inherit' });
  console.log('✅ Backend services stopped successfully.');
} catch (error) {
  console.log('\n================================================================');
  console.log('⚠️  WARNING: Could not connect to Docker or failed to stop services.');
  console.log('Ensure Docker is running and try again.');
  console.log('================================================================\n');
}
