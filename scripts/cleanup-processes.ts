import { execSync } from 'child_process';
import path from 'path';

const projectRoot = process.cwd();
const currentPid = process.pid;

// Keywords that identify our application processes
const keywords = [
  'next dev',
  'server.js',
  'serve-mock-site.ts',
  'next-server'
];

function cleanup() {
  console.log(`🧹 Cleaning up existing project processes in ${projectRoot}...`);

  try {
    // Use lsof to find all processes that have the project directory as their CWD
    // -a: AND the filters
    // -d cwd: Look for the current working directory
    // +D: Search within the directory (recursively, but here we just want the root)
    // -t: Output only PIDs
    // -n: Don't resolve hostnames
    // -P: Don't resolve port names
    let lsofOutput = '';
    try {
      lsofOutput = execSync(`lsof -a -d cwd +D "${projectRoot}" -t -n -P`).toString();
    } catch (e: any) {
      // lsof returns 1 if it finds nothing OR if it encounters errors on some processes
      // We still want to check stdout
      lsofOutput = e.stdout?.toString() || '';
    }
    
    const pids = lsofOutput.split('\n').map(p => p.trim()).filter(p => p && p !== currentPid.toString());

    if (pids.length === 0) {
      console.log('✅ No existing processes found in this directory.');
      return;
    }

    console.log(`🔍 Found ${pids.length} processes to check.`);
    
    // Get full command lines for all PIDs to be sure what we're killing
    const psOutput = execSync(`ps -p ${pids.join(',')} -o pid,args`).toString();
    const psLines = psOutput.split('\n').slice(1);
    
    // Get parent PID to avoid killing it too
    const parentPid = execSync(`ps -o ppid= -p ${currentPid}`).toString().trim();
    
    const processesToKill: { pid: string; cmd: string }[] = [];
    
    for (const line of psLines) {
      if (!line.trim()) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[0];
      const cmd = parts.slice(1).join(' ');

      // Skip current process, parent process, and anything related to this script
      if (pid === currentPid.toString() || pid === parentPid || cmd.includes('cleanup-processes.ts')) {
        continue;
      }

      const lowercaseCmd = cmd.toLowerCase();
      
      // Explicitly exclude IDE and system processes
      const isIdeProcess = lowercaseCmd.includes('antigravity') || lowercaseCmd.includes('vscode');
      if (isIdeProcess) continue;

      // Only kill if it matches our specific app keywords
      const matchesKeyword = keywords.some(k => lowercaseCmd.includes(k.toLowerCase()));
      
      // Also catch generic 'next' or 'tsx' if they are clearly our app's dev processes
      // and not something else. lsof +D already limited us to this project.
      const isDevProcess = (lowercaseCmd.includes('next') && lowercaseCmd.includes('dev'))
                        || (lowercaseCmd.includes('tsx') && lowercaseCmd.includes('scripts/'));

      if (matchesKeyword || isDevProcess) {
        processesToKill.push({ pid, cmd: cmd.substring(0, 100) });
      }
    }

    if (processesToKill.length === 0) {
      console.log('✅ No application processes found.');
      return;
    }

    for (const p of processesToKill) {
      try {
        console.log(`💀 Killing process ${p.pid}: ${p.cmd}...`);
        execSync(`kill -9 ${p.pid}`);
      } catch (err) {
        // Ignore
      }
    }
    
    console.log('✅ Cleanup complete.');
  } catch (error: any) {
    console.error('❌ Error during cleanup:', error);
  }
}

cleanup();
