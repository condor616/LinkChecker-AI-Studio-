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

function readZipEntryText(zipPath: string, name: string): Promise<string> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error('Failed to open zip'));
      let settled = false;
      const finish = (value: string) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      zipfile.on('entry', (entry) => {
        if (entry.fileName !== name) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return reject(streamErr ?? new Error(`Failed to read ${name}`));
          const chunks: Buffer[] = [];
          stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          stream.on('end', () => finish(Buffer.concat(chunks).toString('utf-8')));
          stream.on('error', reject);
        });
      });
      zipfile.on('end', () => {
        if (!settled) reject(new Error(`Zip entry not found: ${name}`));
      });
      zipfile.on('error', reject);
      zipfile.readEntry();
    });
  });
}

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
    expect(paths).toContain('system-settings.json');
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

    const { scope, restored, restoredSystemSettings } = await restoreBackup(userId, legacyZip, { runCommand });
    expect(scope).toBe('legacy-scan-only');
    expect(restored).toEqual(['lynxscan']);
    expect(restoredSystemSettings).toBe(false);
  });

  it('encrypts SMTP credentials in the archive and decrypts them on restore', async () => {
    const smtpPass = 'smtp-test-pass-9f3a2c1b-not-real';
    const backupSecret = 'test-jwt-secret-for-backup-enc-32ch';
    const saved: Array<{ key: string; value: string }> = [];

    const result = await createBackup(userId, username, 'smtp-settings', {
      runCommand,
      backupSecret,
      loadSystemSettings: async () => [
        {
          key: 'smtp',
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          value: JSON.stringify({
            host: 'smtp.test.local',
            port: 26,
            encryption: 'none',
            user: 'relay',
            pass: smtpPass,
            from: 'lynx@test.local',
            adminEmail: 'admin@test.local',
          }),
        },
      ],
    });

    const settingsJson = await readZipEntryText(result.path, 'system-settings.json');
    const manifestJson = await readZipEntryText(result.path, 'manifest.json');
    expect(settingsJson).not.toContain(smtpPass);
    expect(manifestJson).not.toContain(smtpPass);
    expect(manifestJson).toContain('"systemSettings": true');
    expect(settingsJson).toContain('$enc');
    expect(settingsJson).toContain('smtp.test.local');

    const { restored, restoredSystemSettings } = await restoreBackup(userId, result.path, {
      runCommand,
      backupSecret,
      saveSystemSettings: async (rows) => {
        saved.push(...rows);
      },
    });

    expect(restored).toContain('lynxscan');
    expect(restoredSystemSettings).toBe(true);
    expect(saved).toHaveLength(1);
    expect(saved[0].key).toBe('smtp');
    expect(JSON.parse(saved[0].value).pass).toBe(smtpPass);
    expect(JSON.stringify(saved[0])).not.toMatch(/\$enc/);
  });
});
