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
    const { stdout } = await execAsync('docker ps --format "{{.Names}}"');
    const isRunning = stdout.includes('db') || stdout.includes('postgres') || stdout.includes('linkchecker');
    return NextResponse.json({ running: isRunning });
  } catch (error) {
    return NextResponse.json({ running: false, error: 'Could not check Docker status' });
  }
}
