import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { createBackup, restoreBackup } from '@/lib/actions/db-actions';
import { requireApprovedUser } from '@/lib/auth';

export async function GET() {
  try {
    const session = await requireApprovedUser();
    const username = session.email.split('@')[0];
    const backupDir = path.join(process.cwd(), 'data/backups');
    await fs.mkdir(backupDir, { recursive: true });
    
    const files = await fs.readdir(backupDir);
    const backups = await Promise.all(
      files
        .filter(f => f.endsWith('.zip') && f.startsWith(`${username}-`))
        .map(async (f) => {
          const stats = await fs.stat(path.join(backupDir, f));
          return {
            filename: f,
            size: stats.size,
            createdAt: stats.birthtime
          };
        })
    );

    // Sort by createdAt descending
    backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return NextResponse.json({ backups });
  } catch (error) {
    console.error('Failed to list backups:', error);
    return NextResponse.json({ error: 'Failed to list backups' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireApprovedUser();
    const username = session.email.split('@')[0];
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;
      const action = formData.get('action') as string;

      if (action === 'upload-restore' && file) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const tempPath = path.join(process.cwd(), `data/backups/upload-${Date.now()}.zip`);
        await fs.writeFile(tempPath, buffer);
        
        try {
          // Restore doesn't have an owner check for uploads since they are temporary
          await restoreBackup(tempPath);
          return NextResponse.json({ message: 'Backup uploaded and restored successfully' });
        } catch (e: any) {
          console.error('Upload-restore failed:', e);
          return NextResponse.json({ error: e.message || 'Restore failed' }, { status: 500 });
        } finally {
          await fs.unlink(tempPath).catch(() => {});
        }
      }
    }

    const body = await request.json();
    const { action, filename, customFilename } = body;

    if (action === 'create') {
      try {
        const result = await createBackup(username, customFilename);
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
      if (!filename.startsWith(`${username}-`)) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      const zipPath = path.join(process.cwd(), 'data/backups', filename);
      if (!(await fs.stat(zipPath).catch(() => false))) {
        return NextResponse.json({ error: 'Backup file not found' }, { status: 404 });
      }

      await restoreBackup(zipPath);
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
    const username = session.email.split('@')[0];
    const { filename } = await request.json();

    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    // Security: Check ownership (Obfuscated 404)
    if (!filename.startsWith(`${username}-`)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const zipPath = path.join(process.cwd(), 'data/backups', filename);
    await fs.unlink(zipPath);
    
    return NextResponse.json({ message: 'Backup deleted' });
  } catch (error) {
    console.error('Failed to delete backup:', error);
    return NextResponse.json({ error: 'Failed to delete backup' }, { status: 500 });
  }
}
