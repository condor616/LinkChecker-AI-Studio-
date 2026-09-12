import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';
import { resolveSafeZipPath } from '../../packages/backup/src/zip';

describe('backup zip path safety', () => {
  const tempDir = path.join(os.tmpdir(), 'lynx-zip-slip-test');

  it('allows simple relative entries', () => {
    expect(resolveSafeZipPath(tempDir, 'manifest.json')).toBe(path.join(tempDir, 'manifest.json'));
    expect(resolveSafeZipPath(tempDir, 'nested/file.sql')).toBe(path.join(tempDir, 'nested', 'file.sql'));
  });

  it('blocks zip-slip traversal', () => {
    expect(() => resolveSafeZipPath(tempDir, '../etc/passwd')).toThrow(/Zip slip|Unsafe/);
    expect(() => resolveSafeZipPath(tempDir, 'ok/../../etc/passwd')).toThrow(/Zip slip|Unsafe/);
    expect(() => resolveSafeZipPath(tempDir, '/etc/passwd')).toThrow(/Unsafe/);
  });
});
