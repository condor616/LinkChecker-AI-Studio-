import fs from 'node:fs';
import path from 'node:path';

const geoRoot = path.resolve(__dirname, '..');
const buildId = path.join(geoRoot, '.next', 'BUILD_ID');

if (!fs.existsSync(buildId)) {
  console.error('Missing production build artifact: apps/lynxgeo/.next/BUILD_ID');
  console.error('Run `npm run build:lynxgeo` (or `npm run build:all`) before `npm run start:lynxgeo` / `npm run start:all`.');
  process.exit(1);
}

console.log('Production build artifacts found.');
