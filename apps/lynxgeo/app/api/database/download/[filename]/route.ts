import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { isBackupOwnedByUser, getBackupDir } from '@lynx/backup/paths';
import { requireGeoUser, geoAuthHttpStatus } from '@/lib/auth';
import { db as centralDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

function getFunny404Html() {
  return `<!DOCTYPE html><html><body style="background:#0c0c0e;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><div style="text-align:center"><h1>404</h1><p>Backup not found.</p><a href="/settings" style="color:#a855f7">Back to Settings</a></div></body></html>`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  try {
    const { filename } = await params;
    const session = await requireGeoUser();
    const searchParams = request.nextUrl.searchParams;
    const targetUserId = searchParams.get('userId') || session.id;

    if (targetUserId !== session.id && session.role !== 'ADMIN') {
      return new NextResponse(getFunny404Html(), {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const targetUser = await centralDb
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .then((res) => res[0]);
    if (!targetUser) {
      return new NextResponse(getFunny404Html(), {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    const targetUsername = targetUser.email.split('@')[0];

    if (!isBackupOwnedByUser(filename, targetUsername)) {
      return new NextResponse(getFunny404Html(), {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const backupDir = getBackupDir(process.cwd());
    const filePath = path.join(backupDir, filename);
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(backupDir) || !filename.endsWith('.zip')) {
      return new NextResponse(getFunny404Html(), {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (!(await fs.stat(filePath).catch(() => false))) {
      return new NextResponse(getFunny404Html(), {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const fileBuffer = await fs.readFile(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Download failed:', error);
    return new NextResponse(getFunny404Html(), {
      status: geoAuthHttpStatus(error) || 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
