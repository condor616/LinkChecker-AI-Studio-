import { execSync } from 'child_process';

console.log('Stopping Docker wrapper...');

try {
  // Check if Docker daemon is running
  console.log('🔍 Verifying Docker connection...');
  execSync('docker info', { stdio: 'ignore' });
  
  console.log('🛑 Stopping all project containers (Dev & Prod)...');
  try {
    execSync('docker compose down', { stdio: 'inherit' });
  } catch (e) {}
  try {
    execSync('docker compose --env-file .env -f docker/services/docker-compose.yml down', { stdio: 'inherit' });
  } catch (e) {}
  console.log('✅ All backend services stopped successfully.');
} catch (error) {
  console.error('\n' + '='.repeat(64));
  console.error('❌ ERROR: Could not connect to Docker or failed to stop services.');
  console.error('Action: Ensure Docker Desktop is running and try again manually:');
  console.error('Command: npm run stop-docker');
  console.error('='.repeat(64) + '\n');
  process.exit(1);
}
