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

    console.log(`[API] Starting Docker stack using: ${composePath}`);
    
    // We call docker compose directly to avoid dependency on scripts/start-docker.ts in standalone build
    const { stdout, stderr } = await execAsync(`docker compose --env-file .env -f "${composePath}" up -d`);
    
    console.log('[API] Docker start stdout:', stdout);
    if (stderr) console.error('[API] Docker start stderr:', stderr);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API] Failed to start Docker:', error);
    return NextResponse.json({ 
      error: 'Failed to start Docker', 
      details: error.message,
      stderr: error.stderr 
    }, { status: 500 });
  }
}
