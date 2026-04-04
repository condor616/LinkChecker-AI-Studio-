import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getSession } from '@/lib/auth';
import path from 'path';

const execAsync = promisify(exec);

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rootDir = process.cwd();
    const composePath = path.join(rootDir, 'docker/services/docker-compose.yml');
    
    console.log(`[API] Stopping Docker stack using: ${composePath}`);
    
    // We call docker compose directly to avoid dependency on scripts/stop-docker.ts in standalone build
    const { stdout, stderr } = await execAsync(`docker compose --env-file .env -f "${composePath}" down`);
    
    console.log('[API] Docker stop stdout:', stdout);
    if (stderr) console.error('[API] Docker stop stderr:', stderr);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API] Failed to stop Docker:', error);
    return NextResponse.json({ 
      error: 'Failed to stop Docker', 
      details: error.message,
      stderr: error.stderr 
    }, { status: 500 });
  }
}
