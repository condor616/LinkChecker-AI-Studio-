const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const tool = process.argv[2];
const args = process.argv.slice(3);
const appRoot = path.join(__dirname, '..');
const repoRoot = path.join(__dirname, '../../..');

function findNext() {
  const candidates = [
    path.join(appRoot, 'node_modules/next/dist/bin/next'),
    path.join(repoRoot, 'node_modules/next/dist/bin/next'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function findTsx() {
  const candidates = [
    path.join(appRoot, 'node_modules/tsx/dist/cli.mjs'),
    path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

const bin = tool === 'next' ? findNext() : tool === 'tsx' ? findTsx() : null;
if (!bin) {
  console.error(`Lynx GEO could not find ${tool}. Run npm install at the repo root, or npm install inside apps/lynxgeo in Docker.`);
  process.exit(1);
}

const child = spawn(process.execPath, [bin, ...args], {
  stdio: 'inherit',
  cwd: appRoot,
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 1));
