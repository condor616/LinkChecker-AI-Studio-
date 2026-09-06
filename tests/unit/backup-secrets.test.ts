import { describe, it, expect } from 'vitest';
import {
  decryptSecret,
  decryptValueTree,
  encryptSecret,
  encryptValueTree,
  getBackupSecret,
  isEncryptedSecretWrapper,
} from '@lynx/backup';

const SECRET = 'test-jwt-secret-for-backup-enc-32ch';

describe('backup credential encryption', () => {
  it('round-trips a secret with AES-256-GCM', () => {
    const envelope = encryptSecret('unit-test-smtp-pass', SECRET);
    expect(envelope.alg).toBe('aes-256-gcm');
    expect(envelope.kdf).toBe('hkdf-sha256');
    expect(envelope.ct).not.toContain('unit-test-smtp-pass');
    expect(JSON.stringify(envelope)).not.toContain('unit-test-smtp-pass');
    expect(decryptSecret(envelope, SECRET)).toBe('unit-test-smtp-pass');
  });

  it('fails closed when JWT_SECRET does not match', () => {
    const envelope = encryptSecret('unit-test-smtp-pass', SECRET);
    expect(() => decryptSecret(envelope, 'other-jwt-secret-that-is-32-chars!!')).toThrow(
      /JWT_SECRET must match/,
    );
  });

  it('requires a 32+ character secret', () => {
    expect(() => getBackupSecret('short')).toThrow(/JWT_SECRET must be set/);
  });

  it('wraps SMTP pass in $enc and leaves host in clear', () => {
    const encrypted = encryptValueTree(
      {
        host: 'smtp.test.local',
        port: 26,
        user: 'relay',
        pass: 'unit-test-smtp-pass',
        from: 'lynx@test.local',
      },
      SECRET,
    ) as Record<string, unknown>;

    expect(encrypted.host).toBe('smtp.test.local');
    expect(encrypted.user).toBe('relay');
    expect(isEncryptedSecretWrapper(encrypted.pass)).toBe(true);
    expect(JSON.stringify(encrypted)).not.toContain('unit-test-smtp-pass');

    const decrypted = decryptValueTree(encrypted, SECRET) as Record<string, unknown>;
    expect(decrypted.pass).toBe('unit-test-smtp-pass');
    expect(decrypted.host).toBe('smtp.test.local');
  });
});
