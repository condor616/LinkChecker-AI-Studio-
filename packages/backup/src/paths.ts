import path from 'path';

export function resolveMonorepoRoot(cwd: string = process.cwd()): string {
  const normalized = path.normalize(cwd);
  if (normalized.endsWith(`${path.sep}apps${path.sep}lynxgeo`)) {
    return path.join(normalized, '..', '..');
  }
  return normalized;
}

export function getBackupDir(cwd: string = process.cwd()): string {
  if (process.env.LYNX_BACKUP_DIR) {
    return process.env.LYNX_BACKUP_DIR;
  }
  return path.join(resolveMonorepoRoot(cwd), 'data', 'backups');
}

export function sanitizeBackupFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/\.zip$/, '');
}

export function isBackupOwnedByUser(filename: string, username: string): boolean {
  return filename.startsWith(`${username}-`) && filename.endsWith('.zip');
}
