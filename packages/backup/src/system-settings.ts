import { Pool } from 'pg';
import type { DbConnectionInfo } from './db-command';
import {
  decryptValueTree,
  encryptValueTree,
  getBackupSecret,
  treeHasEncryptedSecrets,
  treeHasPlaintextSecrets,
} from './secrets';

export const SYSTEM_SETTINGS_FILE = 'system-settings.json';

export type SystemSettingRow = {
  key: string;
  value: string;
  updatedAt: Date;
};

export type BackupSystemSettingEntry = {
  key: string;
  updatedAt: string;
  value: unknown;
};

export type BackupSystemSettingsFileV1 = {
  version: 1;
  settings: BackupSystemSettingEntry[];
};

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isUndefinedTable(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '42P01',
  );
}

function centralPool(rawInfo: DbConnectionInfo): Pool {
  return new Pool({
    connectionString: `postgres://${rawInfo.user}:${rawInfo.pass}@${rawInfo.host}:${rawInfo.port}/${rawInfo.db}`,
  });
}

export async function loadSystemSettingsFromDb(rawInfo: DbConnectionInfo): Promise<SystemSettingRow[]> {
  const pool = centralPool(rawInfo);
  try {
    const res = await pool.query<{ key: string; value: string; updated_at: Date }>(
      'SELECT key, value, updated_at FROM system_settings',
    );
    return (res.rows || []).map((row) => ({
      key: row.key,
      value: row.value,
      updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
    }));
  } catch (error) {
    if (isUndefinedTable(error)) return [];
    throw error;
  } finally {
    await pool.end();
  }
}

export async function saveSystemSettingsToDb(
  rawInfo: DbConnectionInfo,
  rows: SystemSettingRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const pool = centralPool(rawInfo);
  try {
    await pool.query('BEGIN');
    for (const row of rows) {
      await pool.query(
        `INSERT INTO system_settings (key, value, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
        [row.key, row.value, row.updatedAt],
      );
    }
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => {});
    if (isUndefinedTable(error)) {
      throw new Error('Cannot restore system settings: system_settings table is missing. Run database migrations first.');
    }
    throw error;
  } finally {
    await pool.end();
  }
}

export function toBackupSettingsFile(
  rows: SystemSettingRow[],
  secretOverride?: string,
): BackupSystemSettingsFileV1 {
  const needsSecret = rows.some((row) => {
    const parsed = tryParseJson(row.value);
    if (parsed !== undefined) return treeHasPlaintextSecrets(parsed);
    return false;
  });
  const secret = needsSecret ? getBackupSecret(secretOverride) : undefined;

  return {
    version: 1,
    settings: rows.map((row) => {
      const parsed = tryParseJson(row.value);
      const value =
        parsed !== undefined && secret
          ? encryptValueTree(parsed, secret)
          : parsed !== undefined
            ? parsed
            : row.value;
      return {
        key: row.key,
        updatedAt: row.updatedAt.toISOString(),
        value,
      };
    }),
  };
}

export function fromBackupSettingsFile(
  file: BackupSystemSettingsFileV1,
  secretOverride?: string,
): SystemSettingRow[] {
  const needsSecret = file.settings.some((entry) => treeHasEncryptedSecrets(entry.value));
  const secret = needsSecret ? getBackupSecret(secretOverride) : undefined;

  return file.settings.map((entry) => {
    const decrypted = secret ? decryptValueTree(entry.value, secret) : entry.value;
    const value = typeof decrypted === 'string' ? decrypted : JSON.stringify(decrypted);
    const updatedAt = entry.updatedAt ? new Date(entry.updatedAt) : new Date();
    return {
      key: entry.key,
      value,
      updatedAt: Number.isNaN(updatedAt.getTime()) ? new Date() : updatedAt,
    };
  });
}

export function parseSystemSettingsFile(raw: string): BackupSystemSettingsFileV1 | null {
  try {
    const parsed = JSON.parse(raw) as BackupSystemSettingsFileV1;
    if (parsed?.version === 1 && Array.isArray(parsed.settings)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeSystemSettingsFile(file: BackupSystemSettingsFileV1): string {
  return JSON.stringify(file, null, 2);
}
