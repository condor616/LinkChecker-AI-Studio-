import { execSync } from 'child_process';
import path from 'path';

const repoRoot = process.cwd();
const geoRoot = path.join(repoRoot, 'apps/lynxgeo');

console.log('🧹 Cleaning up LynxScan and Lynx GEO app processes...');
execSync(`npx tsx "${path.join(repoRoot, 'scripts/cleanup-processes.ts')}"`, { cwd: repoRoot, stdio: 'inherit' });
execSync(`npx tsx "${path.join(geoRoot, 'scripts/cleanup-processes.ts')}"`, { cwd: geoRoot, stdio: 'inherit' });
console.log('✅ All application processes cleaned up.');
