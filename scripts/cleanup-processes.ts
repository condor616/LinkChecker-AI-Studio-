import { execSync } from 'child_process';

const projectRoot = process.cwd();
const currentPid = process.pid;

/** Real leftover LynxScan app processes — not lifecycle/orchestration scripts. */
const keywords = ['next-server', 'serve-mock-site.ts', '.next/standalone/server.js'];

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

function isGeoProcess(cmd: string): boolean {
  const lower = cmd.toLowerCase();
  return (
    lower.includes('apps/lynxgeo') ||
    lower.includes('lynxgeo') ||
    lower.includes('with-deps.cjs') ||
    lower.includes('3010')
  );
}

function isLynxScanAppProcess(cmd: string): boolean {
  const lower = cmd.toLowerCase();
  if (keywords.some((k) => lower.includes(k.toLowerCase()))) return true;
  // next dev / next start for the root app (not GEO on 3010)
  if (lower.includes('next') && (lower.includes(' next dev') || lower.endsWith('next dev') || lower.includes('next start'))) {
    if (lower.includes('3010') || lower.includes('apps/lynxgeo')) return false;
    return true;
  }
  // Host worker for LynxScan only
  if (lower.includes('tsx') && lower.includes('worker/index.ts') && !isGeoProcess(cmd)) return true;
  if (lower.includes('npm run worker') && !lower.includes('lynxgeo')) return true;
  return false;
}

function cleanup() {
  console.log(`🧹 Cleaning up existing project processes in ${projectRoot}...`);
  const protectedPids = ancestorPids(currentPid);

  try {
    let lsofOutput = '';
    try {
      lsofOutput = execSync(`lsof -a -d cwd +D "${projectRoot}" -t -n -P`).toString();
    } catch (e: any) {
      lsofOutput = e.stdout?.toString() || '';
    }

    const pids = lsofOutput
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p && !protectedPids.has(p));

    if (pids.length === 0) {
      console.log('✅ No existing processes found in this directory.');
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

        if (protectedPids.has(pid) || isProtectedCmd(cmd) || isGeoProcess(cmd)) continue;
        if (isLynxScanAppProcess(cmd)) {
          processesToKill.push({ pid, cmd: cmd.substring(0, 100) });
        }
      }

      if (processesToKill.length === 0) {
        console.log('✅ No application processes found.');
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

  killListeningPort(3000, protectedPids);
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
        if (isProtectedCmd(cmd) || isGeoProcess(cmd)) continue;
        console.log(`💀 Killing listener on :${port} ${pid}: ${cmd.substring(0, 100)}`);
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
