import { execSync } from 'child_process';

const repoRoot = process.cwd();

console.log('🛑 Stopping LynxScan and Lynx GEO...');
try {
  execSync('npx tsx scripts/cleanup-all.ts', { cwd: repoRoot, stdio: 'inherit' });
} catch {
  console.warn('⚠️  App process cleanup reported an error; continuing with Docker shutdown.');
}
try {
  execSync('npx tsx scripts/stop-docker.ts', { cwd: repoRoot, stdio: 'inherit' });
} catch {
  // ignore
}
try {
  execSync('npx tsx apps/lynxgeo/scripts/stop-docker.ts', { cwd: repoRoot, stdio: 'inherit' });
} catch {
  // ignore
}
console.log('✅ Both apps and their Docker stacks are stopped.');
