import { execSync } from 'child_process';
import path from 'path';

const geoRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(geoRoot, '../..');
const envPath = path.join(repoRoot, '.env');
const geoCompose = path.join(geoRoot, 'docker/services/docker-compose.yml');

console.log('Stopping Docker wrapper...');

try {
  console.log('🔍 Verifying Docker connection...');
  execSync('docker info', { stdio: 'ignore' });

  console.log('🛑 Stopping Lynx GEO project containers (Dev & Prod)...');
  try {
    execSync('docker compose down', { cwd: geoRoot, stdio: 'inherit' });
  } catch {
    // ignore
  }
  try {
    execSync(`docker compose --env-file "${envPath}" -f "${geoCompose}" down`, {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  } catch {
    // ignore
  }
  console.log('✅ GEO backend services stopped successfully.');
} catch {
  console.error('\n' + '='.repeat(64));
  console.error('❌ ERROR: Could not connect to Docker or failed to stop services.');
  console.error('Action: Ensure Docker Desktop is running and try again manually:');
  console.error('Command: npm run stop-docker:lynxgeo');
  console.error('='.repeat(64) + '\n');
  process.exit(1);
}
