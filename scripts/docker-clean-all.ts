import { execSync } from 'child_process';
import path from 'path';

const repoRoot = process.cwd();
const geoRoot = path.join(repoRoot, 'apps/lynxgeo');

console.log('🧹 Stopping Docker stacks for LynxScan and Lynx GEO (volumes kept)...');

const commands = [
  { cwd: repoRoot, cmd: 'docker compose down' },
  { cwd: geoRoot, cmd: 'docker compose down' },
  { cwd: repoRoot, cmd: 'docker compose --env-file .env -f docker/services/docker-compose.yml down' },
  { cwd: repoRoot, cmd: 'docker compose --env-file .env -f apps/lynxgeo/docker/services/docker-compose.yml down' },
];

try {
  execSync('docker info', { stdio: 'ignore' });
} catch {
  console.error('❌ Docker is not running.');
  process.exit(1);
}

for (const { cwd, cmd } of commands) {
  try {
    execSync(cmd, { cwd, stdio: 'inherit' });
  } catch {
    // already down
  }
}

console.log('✅ Docker stacks stopped. Named volumes were not removed.');
console.log('   Use `npm run nuke` only if you want a full data wipe.');
