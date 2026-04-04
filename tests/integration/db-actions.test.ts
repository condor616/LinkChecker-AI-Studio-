import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

// Mock child_process properly
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  
  const mockedExec = vi.fn((cmd, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
    }
    console.log('MOCK EXEC CALLED:', cmd);
    
    if (cmd.includes('>')) {
      const filePath = cmd.match(/> "([^"]+)"/)?.[1] || cmd.match(/> ([^ ]+)/)?.[1];
      if (filePath) {
        const cleanPath = filePath.replace(/"/g, '');
        const rfs = require('fs');
        rfs.writeFileSync(cleanPath, '-- Fake SQL Dump');
      }
    }

    if (callback) callback(null, { stdout: 'success', stderr: '' });
    // Need to return an object that can be "promisified"
    return {
       on: vi.fn(),
       stdout: { on: vi.fn() },
       stderr: { on: vi.fn() },
    };
  });

  return {
    ...actual,
    exec: mockedExec,
    default: {
        ...actual.default,
        exec: mockedExec
    }
  };
});

// Import the real db-actions after the mock is set
import { createBackup, restoreBackup } from '@/lib/actions/db-actions';
import { exec } from 'child_process';

describe('Database Backup and Restore', () => {
  const userId = 'test_user';
  const username = 'testuser';
  const backupDir = path.join(process.cwd(), 'data/backups');

  beforeEach(async () => {
    await fs.mkdir(backupDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    const files = await fs.readdir(backupDir).catch(() => []);
    for (const file of files) {
      if (file.startsWith(username) && file.endsWith('.zip')) {
        await fs.unlink(path.join(backupDir, file)).catch(() => {});
      }
    }
  });

  it('creates a zip backup containing a database.sql file', async () => {
    const result = await createBackup(userId, username, 'test-snapshot');
    
    expect(result.path).toContain(username);
    expect(result.filename).toContain('test-snapshot');

    const stats = await fs.stat(result.path);
    expect(stats.size).toBeGreaterThan(0);
    
    expect(exec).toHaveBeenCalled();
  });

  it('restores a backup by unzipping and running psql', async () => {
    const backup = await createBackup(userId, username, 'restore-test');
    
    await restoreBackup(userId, backup.path);

    expect(exec).toHaveBeenCalled();
  });
});
