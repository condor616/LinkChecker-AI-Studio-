import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { createBackup, restoreBackup, listBackups } from '@lynx/backup/backup';
import { isBackupOwnedByUser, getBackupDir } from '@lynx/backup/paths';
import { requireApprovedUser, requireAdmin } from '@/lib/auth';
import { getDb, db as centralDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const session = await requireApprovedUser();
    const searchParams = request.nextUrl.searchParams;
    let targetUserId = searchParams.get('userId') || session.id;

    // Security: Only admins can view other users' backups
    if (targetUserId !== session.id && session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Get the username for the target user (for file filtering)
    const targetUser = await centralDb.select().from(users).where(eq(users.id, targetUserId)).then(res => res[0]);
    if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const targetUsername = targetUser.email.split('@')[0];

    const backups = await listBackups(targetUsername);

    return NextResponse.json({
      backups: backups.map((b) => ({
        filename: b.filename,
        size: b.size,
        createdAt: b.createdAt,
        scope: b.scope,
      })),
    });
  } catch (error) {
    console.error('Failed to list backups:', error);
    return NextResponse.json({ error: 'Failed to list backups' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireApprovedUser();
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const action = formData.get('action') as string;
        const targetUserId = (formData.get('userId') as string) || session.id;

        // Security: Only admins can restore to other users
        if (targetUserId !== session.id && session.role !== 'ADMIN') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        if (action === 'upload-restore' && file) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const tempPath = path.join(getBackupDir(), `upload-${Date.now()}.zip`);
          await fs.writeFile(tempPath, buffer);

          try {
            await restoreBackup(targetUserId, tempPath);
            return NextResponse.json({ message: 'Backup uploaded and restored successfully' });
          } catch (e: any) {
            console.error('Upload-restore failed:', e);
            return NextResponse.json({ error: e.message || 'Restore failed' }, { status: 500 });
          } finally {
            await fs.unlink(tempPath).catch(() => {});
          }
        }

        return NextResponse.json({ error: 'A backup .zip file is required for upload-restore' }, { status: 400 });
      } catch (e: any) {
        console.error('Failed to parse multipart upload:', e);
        return NextResponse.json(
          {
            error:
              e?.message?.includes('FormData') || e?.message?.includes('boundary')
                ? 'Upload failed. The backup file may be too large — try restarting the dev server after updating, or place the .zip in data/backups/ and use Restore from the list.'
                : e?.message || 'Failed to parse upload',
          },
          { status: 400 },
        );
      }
    }

    const body = await request.json();
    const { action, filename, customFilename, userId: targetUserId = session.id } = body;

    // Security check for target user
    if (targetUserId !== session.id && session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get the username for the target user (for filename prefix)
    const targetUser = await centralDb.select().from(users).where(eq(users.id, targetUserId)).then(res => res[0]);
    if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const targetUsername = targetUser.email.split('@')[0];

    if (action === 'create') {
      try {
        const result = await createBackup(targetUserId, targetUsername, customFilename);
        return NextResponse.json({ message: 'Backup created successfully', backup: result });
      } catch (e: any) {
        console.error('Create backup caught error:', e);
        return NextResponse.json({ error: e.message || 'Failed to create backup' }, { status: 500 });
      }
    }

    if (action === 'restore') {
      if (!filename) {
        return NextResponse.json({ error: 'Filename is required for restore' }, { status: 400 });
      }

      // Security: Check ownership (Obfuscated 404)
      if (!isBackupOwnedByUser(filename, targetUsername)) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      const zipPath = path.join(getBackupDir(), filename);
      if (!(await fs.stat(zipPath).catch(() => false))) {
        return NextResponse.json({ error: 'Backup file not found' }, { status: 404 });
      }

      await restoreBackup(targetUserId, zipPath);
      return NextResponse.json({ message: 'Restore completed successfully' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Unhandled Database API POST error:', error);
    return NextResponse.json({ 
      error: error.message || 'Operation failed'
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireApprovedUser();
    const { filename, userId: targetUserId = session.id } = await request.json();

    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    // Security check
    if (targetUserId !== session.id && session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const targetUser = await centralDb.select().from(users).where(eq(users.id, targetUserId)).then(res => res[0]);
    if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const targetUsername = targetUser.email.split('@')[0];

    // Security: Check ownership (Obfuscated 404)
    if (!isBackupOwnedByUser(filename, targetUsername)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const zipPath = path.join(getBackupDir(), filename);
    await fs.unlink(zipPath);
    
    return NextResponse.json({ message: 'Backup deleted' });
  } catch (error) {
    console.error('Failed to delete backup:', error);
    return NextResponse.json({ error: 'Failed to delete backup' }, { status: 500 });
  }
}
