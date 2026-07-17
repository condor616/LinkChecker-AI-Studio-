import fs from 'node:fs';
import path from 'node:path';

const serverPath = path.join(process.cwd(), '.next', 'standalone', 'server.js');

if (!fs.existsSync(serverPath)) {
  console.error('Missing production build artifact: .next/standalone/server.js');
  console.error('Run `npm run build` before `npm run start`.');
  process.exit(1);
}

console.log('Production build artifacts found.');
