import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

vi.mock('pg', () => {
  const mockQuery = vi.fn(async (sql: string) => {
    if (sql.includes('pg_database')) {
      return { rowCount: 0, rows: [] };
    }
    return { rowCount: 1, rows: [] };
  });

  return {
    Pool: vi.fn(() => ({
      query: mockQuery,
      end: vi.fn(async () => {}),
    })),
  };
});

import yauzl from 'yauzl';

function readZipEntryNames(zipPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error('Failed to open zip'));
      const names: string[] = [];
      zipfile.on('entry', (entry) => {
        names.push(entry.fileName);
        zipfile.readEntry();
      });
      zipfile.on('end', () => resolve(names));
      zipfile.on('error', reject);
      zipfile.readEntry();
    });
  });
}

describe('Database Backup and Restore', () => {
  const userId = 'test_user';
  const username = 'testuser';
  const backupDir = path.join(process.cwd(), 'data/backups');
  let createBackup: typeof import('@lynx/backup/backup').createBackup;
  let restoreBackup: typeof import('@lynx/backup/backup').restoreBackup;
  const runCommand = vi.fn(async (command: string) => {
    if (command.includes('>')) {
      const filePath = command.match(/> "([^"]+)"/)?.[1];
      if (filePath) {
        await fs.writeFile(filePath, '-- Fake SQL Dump');
      }
    }
  });

  beforeAll(async () => {
    ({ createBackup, restoreBackup } = await import('@lynx/backup/backup'));
  });

  beforeEach(async () => {
    await fs.mkdir(backupDir, { recursive: true });
    runCommand.mockClear();
  });

  afterEach(async () => {
    const files = await fs.readdir(backupDir).catch(() => []);
    for (const file of files) {
      if (file.startsWith(username) && file.endsWith('.zip')) {
        await fs.unlink(path.join(backupDir, file)).catch(() => {});
      }
    }
    await fs.rm(path.join(backupDir, 'tmp-restore'), { recursive: true, force: true }).catch(() => {});
  });

  it('creates a unified zip backup with manifest and lynxscan.sql', async () => {
    const result = await createBackup(userId, username, 'test-snapshot', { runCommand });

    expect(result.path).toContain(username);
    expect(result.filename).toContain('test-snapshot');
    expect(result.scope).toBe('scan-only');

    const stats = await fs.stat(result.path);
    expect(stats.size).toBeGreaterThan(0);
    expect(runCommand).toHaveBeenCalled();

    const paths = await readZipEntryNames(result.path);
    expect(paths).toContain('manifest.json');
    expect(paths).toContain('lynxscan.sql');
    expect(paths).not.toContain('database.sql');
  });

  it('restores a unified backup by extracting and running psql', async () => {
    const backup = await createBackup(userId, username, 'restore-test', { runCommand });
    const { restored } = await restoreBackup(userId, backup.path, { runCommand });

    expect(restored).toContain('lynxscan');
    expect(runCommand).toHaveBeenCalled();
  });

  it('restores legacy database.sql-only backups for scan data', async () => {
    const legacyDir = path.join(backupDir, 'legacy-build');
    await fs.mkdir(legacyDir, { recursive: true });
    const legacySql = path.join(legacyDir, 'database.sql');
    await fs.writeFile(legacySql, '-- legacy dump');

    const archiver = (await import('archiver')).default;
    const { createWriteStream } = await import('fs');
    const legacyZip = path.join(backupDir, `${username}-legacy-test.zip`);
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(legacyZip);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', () => resolve());
      archive.on('error', reject);
      archive.pipe(output);
      archive.file(legacySql, { name: 'database.sql' });
      archive.finalize();
    });

    const { scope, restored } = await restoreBackup(userId, legacyZip, { runCommand });
    expect(scope).toBe('legacy-scan-only');
    expect(restored).toEqual(['lynxscan']);
  });
});
