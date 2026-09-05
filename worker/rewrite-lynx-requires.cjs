#!/usr/bin/env node
/**
 * tsc emits require("@lynx/...") which still resolve to TypeScript package
 * mains. Rewrite those specifiers to the compiled copies under dist/worker.
 */
const fs = require('fs');
const path = require('path');

const distRoot = path.join(__dirname, '../dist/worker');
const specToAbs = {
  '@lynx/crawler-core/url': path.join(distRoot, 'packages/crawler-core/src/url'),
  '@lynx/crawler-core': path.join(distRoot, 'packages/crawler-core/src'),
  '@lynx/auth': path.join(distRoot, 'packages/auth/src'),
  '@lynx/db': path.join(distRoot, 'packages/db/src'),
  '@lynx/backup/db-command': path.join(distRoot, 'packages/backup/src/db-command'),
  '@lynx/backup/manifest': path.join(distRoot, 'packages/backup/src/manifest'),
  '@lynx/backup/paths': path.join(distRoot, 'packages/backup/src/paths'),
  '@lynx/backup/backup': path.join(distRoot, 'packages/backup/src/backup'),
  '@lynx/backup': path.join(distRoot, 'packages/backup/src'),
};
const specs = Object.keys(specToAbs).sort((a, b) => b.length - a.length);

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith('.js')) rewrite(p);
  }
}

function rewrite(file) {
  let source = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const spec of specs) {
    const re = new RegExp(`require\\(["']${spec.replace(/[/.]/g, '\\$&')}["']\\)`, 'g');
    let rel = path.relative(path.dirname(file), specToAbs[spec]).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    const next = source.replace(re, `require("${rel}")`);
    if (next !== source) {
      source = next;
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(file, source);
}

if (!fs.existsSync(distRoot)) {
  console.error(`rewrite-lynx-requires: missing ${distRoot}`);
  process.exit(1);
}
walk(distRoot);
