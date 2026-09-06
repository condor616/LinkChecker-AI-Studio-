import { describe, it, expect } from 'vitest';
import {
  fromBackupSettingsFile,
  toBackupSettingsFile,
  type SystemSettingRow,
} from '@lynx/backup';

const SECRET = 'test-jwt-secret-for-backup-enc-32ch';
const SMTP_PASS = 'smtp-test-pass-9f3a2c1b-not-real';

function smtpRow(pass: string): SystemSettingRow {
  return {
    key: 'smtp',
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    value: JSON.stringify({
      host: 'smtp.test.local',
      port: 26,
      encryption: 'none',
      user: 'relay',
      pass,
      from: 'lynx@test.local',
      adminEmail: 'admin@test.local',
    }),
  };
}

describe('backup system settings', () => {
  it('encrypts SMTP pass and restores the original JSON', () => {
    const file = toBackupSettingsFile([smtpRow(SMTP_PASS)], SECRET);
    const serialized = JSON.stringify(file);

    expect(file.settings).toHaveLength(1);
    expect(file.settings[0].key).toBe('smtp');
    expect(serialized).not.toContain(SMTP_PASS);
    expect(serialized).toContain('$enc');
    expect(serialized).toContain('smtp.test.local');

    const restored = fromBackupSettingsFile(file, SECRET);
    expect(restored).toHaveLength(1);
    expect(JSON.parse(restored[0].value).pass).toBe(SMTP_PASS);
    expect(JSON.parse(restored[0].value).host).toBe('smtp.test.local');
  });

  it('does not require a secret when no credentials are present', () => {
    const file = toBackupSettingsFile(
      [
        {
          key: 'smtp',
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          value: JSON.stringify({
            host: 'smtp.test.local',
            port: 26,
            encryption: 'none',
            user: '',
            pass: '',
            from: 'lynx@test.local',
            adminEmail: '',
          }),
        },
      ],
      undefined,
    );
    expect(JSON.stringify(file)).not.toContain('$enc');
    const restored = fromBackupSettingsFile(file);
    expect(JSON.parse(restored[0].value).host).toBe('smtp.test.local');
    expect(JSON.parse(restored[0].value).pass).toBe('');
  });

  it('leaves empty settings files as a no-op restore', () => {
    expect(fromBackupSettingsFile({ version: 1, settings: [] })).toEqual([]);
  });
});
