import { spawn, type ChildProcess } from 'child_process';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const prod = process.argv.includes('--prod');
const children: ChildProcess[] = [];
let shuttingDown = false;

function start(label: string, command: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  console.log(`▶️  ${label}: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    shell: process.platform === 'win32',
  });
  children.push(child);
  child.on('exit', (code) => {
    if (shuttingDown) return;
    if (code && code !== 0) {
      console.error(`${label} exited with code ${code}`);
    }
  });
  return child;
}

if (prod) {
  start('LynxScan', 'node', ['.next/standalone/server.js'], {
    PORT: process.env.PORT || '3000',
    HOSTNAME: process.env.HOSTNAME || 'localhost',
  });
  start('Lynx GEO', 'npm', ['--prefix', 'apps/lynxgeo', 'run', 'start:app']);
} else {
  start('LynxScan', 'npx', ['next', 'dev']);
  start('Lynx GEO', 'npm', ['--prefix', 'apps/lynxgeo', 'run', 'dev:app']);
}

function killTree(pid: number) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
      return;
    }
    try {
      execSync(`pkill -TERM -P ${pid}`, { stdio: 'ignore' });
    } catch {
      // no children
    }
    process.kill(pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n🛑 Stopping LynxScan and Lynx GEO...');
  for (const child of children) {
    if (child.pid) killTree(child.pid);
  }
  setTimeout(() => process.exit(0), 1500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
