import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getSession } from '@/lib/auth';

const execAsync = promisify(exec);

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // We check for any running containers that match our stack components
    // The names usually start with the directory name or 'services-'
    const { stdout } = await execAsync('docker ps --format "{{.Names}}"');
    const containers = stdout.split('\n').filter(name => name.trim().length > 0);
    
    // Look for db, redis or drizzle-studio associated with this project
    const isRunning = containers.some(name => 
      (name.includes('db') || name.includes('postgres') || name.includes('redis') || name.includes('lynx_scan')) &&
      (name.includes('services') || name.includes('lynx_scan'))
    );
    
    return NextResponse.json({ running: isRunning, containers });
  } catch (error) {
    return NextResponse.json({ running: false, error: 'Could not check Docker status' });
  }
}
