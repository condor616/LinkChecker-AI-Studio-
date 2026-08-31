import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('☢️  Initiating Nuke Sequence...');

console.log('1. Stopping and destroying Docker containers & volumes...');
try {
  execSync('docker compose -f docker/services/docker-compose.yml down -v', { stdio: 'inherit' });
} catch (e) {
  console.log('Note: Failed to execute docker compose down (maybe it is already down or not found). Continuing...');
}
try {
  execSync('docker compose -f apps/lynxgeo/docker/services/docker-compose.yml down -v', { stdio: 'inherit' });
} catch (e) {
  console.log('Note: Failed to tear down Lynx GEO docker stack. Continuing...');
}

console.log('2. Deleting .env file...');
const envPath = path.join(process.cwd(), '.env');
const envTestPath = path.join(process.cwd(), '.env.test');

if (fs.existsSync(envPath)) {
  fs.unlinkSync(envPath);
  console.log('✅ .env deleted.');
} else {
  console.log('✅ .env does not exist.');
}

if (fs.existsSync(envTestPath)) {
  fs.unlinkSync(envTestPath);
  console.log('✅ .env.test deleted.');
}

console.log('3. Wiping data directory if it exists...');
const dataPath = path.join(process.cwd(), 'data');
if (fs.existsSync(dataPath)) {
  fs.rmSync(dataPath, { recursive: true, force: true });
  console.log('✅ Data directory deleted.');
}

console.log('4. Wiping Next.js cache...');
const nextCachePath = path.join(process.cwd(), '.next');
if (fs.existsSync(nextCachePath)) {
  fs.rmSync(nextCachePath, { recursive: true, force: true });
  console.log('✅ .next directory deleted.');
}

console.log('\n☢️  Nuke complete! You are now back to a completely clean slate.');
console.log('To restart:');
console.log('1. Copy .env.example to .env and configure it');
console.log('2. Run `npm run dev`');
