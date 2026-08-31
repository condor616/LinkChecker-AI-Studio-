import { execSync } from 'child_process';
import path from 'path';

const geoRoot = path.resolve(__dirname, '..');
const currentPid = process.pid;

const protectedCmdFragments = [
  'cleanup-processes.ts',
  'cleanup-all.ts',
  'start-docker',
  'stop-docker',
  'stop-all.ts',
  'ensure-build.ts',
  'run-apps.ts',
  'docker-clean-all.ts',
  'nuke.ts',
  'reset-all.ts',
];

function ancestorPids(pid: number): Set<string> {
  const ids = new Set<string>([String(pid)]);
  let current = pid;
  for (let i = 0; i < 32; i++) {
    try {
      const parent = execSync(`ps -o ppid= -p ${current}`, { encoding: 'utf8' }).trim();
      if (!parent || parent === '0' || ids.has(parent)) break;
      ids.add(parent);
      current = Number(parent);
      if (!Number.isFinite(current)) break;
    } catch {
      break;
    }
  }
  return ids;
}

function isProtectedCmd(cmd: string): boolean {
  const lower = cmd.toLowerCase();
  if (lower.includes('antigravity') || lower.includes('vscode') || lower.includes('cursor')) return true;
  return protectedCmdFragments.some((f) => lower.includes(f.toLowerCase()));
}

function isHostGeoWorker(cmd: string): boolean {
  const lower = cmd.toLowerCase();
  if (isProtectedCmd(cmd) || lower.includes('docker')) return false;
  return (
    lower.includes('worker:lynxgeo') ||
    (lower.includes('with-deps.cjs') && lower.includes('worker/index.ts')) ||
    (lower.includes('apps/lynxgeo') && lower.includes('worker/index.ts'))
  );
}

function isGeoAppProcess(cmd: string): boolean {
  const lower = cmd.toLowerCase();
  if (isProtectedCmd(cmd)) return false;
  if (lower.includes('next') && lower.includes('3010')) return true;
  if (lower.includes('with-deps.cjs') && (lower.includes('next ') || lower.includes('worker/index.ts'))) return true;
  if (lower.includes('worker:lynxgeo')) return true;
  if (lower.includes('tsx') && lower.includes('worker/index.ts') && lower.includes('lynxgeo')) return true;
  return false;
}

function killHostGeoWorkers(protectedPids: Set<string>) {
  try {
    const ps = execSync('ps -ax -o pid=,command=', { encoding: 'utf8' });
    let killed = 0;
    for (const line of ps.split('\n')) {
      const match = line.match(/^\s*(\d+)\s+(.*)$/);
      if (!match) continue;
      const pid = match[1];
      const cmd = match[2];
      if (protectedPids.has(pid)) continue;
      if (!isHostGeoWorker(cmd)) continue;
      console.log(`💀 Killing leftover host GEO worker ${pid}: ${cmd.substring(0, 100)}`);
      try {
        execSync(`kill -9 ${pid}`);
        killed += 1;
      } catch {
        // ignore
      }
    }
    if (killed === 0) {
      console.log('✅ No leftover host GEO workers (tsx worker / npm run worker:lynxgeo).');
    }
  } catch (error: any) {
    console.error('❌ Error scanning host GEO workers:', error?.message || error);
  }
}

function cleanup() {
  console.log(`🧹 Cleaning up existing Lynx GEO processes in ${geoRoot}...`);
  const protectedPids = ancestorPids(currentPid);
  killHostGeoWorkers(protectedPids);

  try {
    let lsofOutput = '';
    try {
      lsofOutput = execSync(`lsof -a -d cwd +D "${geoRoot}" -t -n -P`).toString();
    } catch (e: any) {
      lsofOutput = e.stdout?.toString() || '';
    }

    const pids = lsofOutput
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p && !protectedPids.has(p));

    if (pids.length === 0) {
      console.log('✅ No existing GEO processes found in this directory.');
    } else {
      console.log(`🔍 Found ${pids.length} processes to check.`);
      const psOutput = execSync(`ps -p ${pids.join(',')} -o pid,args`).toString();
      const psLines = psOutput.split('\n').slice(1);
      const processesToKill: { pid: string; cmd: string }[] = [];

      for (const line of psLines) {
        if (!line.trim()) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[0];
        const cmd = parts.slice(1).join(' ');

        if (protectedPids.has(pid) || isProtectedCmd(cmd)) continue;
        if (isGeoAppProcess(cmd)) {
          processesToKill.push({ pid, cmd: cmd.substring(0, 100) });
        }
      }

      if (processesToKill.length === 0) {
        console.log('✅ No GEO application processes found.');
      } else {
        for (const p of processesToKill) {
          try {
            console.log(`💀 Killing process ${p.pid}: ${p.cmd}...`);
            execSync(`kill -9 ${p.pid}`);
          } catch {
            // ignore
          }
        }
        console.log('✅ Cleanup complete.');
      }
    }
  } catch (error: any) {
    console.error('❌ Error during cleanup:', error);
  }

  killListeningPort(3010, protectedPids);
}

function killListeningPort(port: number, protectedPids: Set<string>) {
  try {
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' });
    const pids = out
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p && !protectedPids.has(p));
    for (const pid of pids) {
      try {
        const cmd = execSync(`ps -p ${pid} -o args=`, { encoding: 'utf8' }).trim();
        if (isProtectedCmd(cmd)) continue;
        console.log(`💀 Killing GEO listener on :${port} ${pid}: ${cmd.substring(0, 100)}`);
        execSync(`kill -9 ${pid}`);
      } catch {
        // ignore
      }
    }
  } catch {
    // nothing listening
  }
}

cleanup();
