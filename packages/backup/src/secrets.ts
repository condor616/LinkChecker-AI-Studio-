/**
 * Credential encryption for backup archives.
 *
 * There is no separate backup passphrase UI. SMTP passwords (and other
 * credential fields) are encrypted with AES-256-GCM. The key is derived via
 * HKDF-SHA256 from `JWT_SECRET` — the same secret the apps already require.
 *
 * Envelope fields (all base64):
 *   salt  — random 16-byte HKDF salt, stored with the ciphertext
 *   iv    — random 12-byte GCM nonce
 *   tag   — GCM authentication tag
 *   ct    — ciphertext
 *
 * Restore decrypts by running the same HKDF over the current process
 * `JWT_SECRET` and the stored salt, then AES-256-GCM decrypt. If JWT_SECRET
 * has changed since the backup was taken, decrypt fails with a clear error
 * (product SQL dumps still restore). Ciphertext, keys, and passwords are
 * never written to logs or to manifest.json.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export const BACKUP_SECRET_ALG = 'aes-256-gcm' as const;
export const BACKUP_SECRET_KDF = 'hkdf-sha256' as const;
export const BACKUP_SECRET_HKDF_INFO = 'lynx-backup-system-settings-v1';

const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

/** JSON keys treated as credentials and encrypted in backup archives. */
export const SECRET_JSON_KEYS = new Set([
  'pass',
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'smtp_pass',
]);

export type EncryptedEnvelope = {
  v: 1;
  alg: typeof BACKUP_SECRET_ALG;
  kdf: typeof BACKUP_SECRET_KDF;
  salt: string;
  iv: string;
  tag: string;
  ct: string;
};

export type EncryptedSecretWrapper = {
  $enc: EncryptedEnvelope;
};

export function getBackupSecret(override?: string): string {
  const secret = override ?? process.env.JWT_SECRET ?? '';
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be set (32+ characters) to encrypt or decrypt credentials in backups',
    );
  }
  return secret;
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  if (!value || typeof value !== 'object') return false;
  const env = value as Record<string, unknown>;
  return (
    env.v === 1 &&
    env.alg === BACKUP_SECRET_ALG &&
    env.kdf === BACKUP_SECRET_KDF &&
    typeof env.salt === 'string' &&
    typeof env.iv === 'string' &&
    typeof env.tag === 'string' &&
    typeof env.ct === 'string'
  );
}

export function isEncryptedSecretWrapper(value: unknown): value is EncryptedSecretWrapper {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value as object);
  return keys.length === 1 && keys[0] === '$enc' && isEncryptedEnvelope((value as EncryptedSecretWrapper).$enc);
}

function deriveKey(secret: string, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, salt, BACKUP_SECRET_HKDF_INFO, KEY_LENGTH));
}

export function encryptSecret(plaintext: string, secret: string): EncryptedEnvelope {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(secret, salt);
  const cipher = createCipheriv(BACKUP_SECRET_ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    v: 1,
    alg: BACKUP_SECRET_ALG,
    kdf: BACKUP_SECRET_KDF,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  };
}

export function decryptSecret(envelope: EncryptedEnvelope, secret: string): string {
  try {
    const salt = Buffer.from(envelope.salt, 'base64');
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    const ct = Buffer.from(envelope.ct, 'base64');
    const key = deriveKey(secret, salt);
    const decipher = createDecipheriv(BACKUP_SECRET_ALG, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    throw new Error(
      'Failed to decrypt backup credentials. JWT_SECRET must match the secret used when the backup was created.',
    );
  }
}

function wrapEncrypted(plaintext: string, secret: string): EncryptedSecretWrapper {
  return { $enc: encryptSecret(plaintext, secret) };
}

export function encryptValueTree(value: unknown, secret: string): unknown {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => encryptValueTree(item, secret));
  if (!value || typeof value !== 'object') return value;
  if (isEncryptedSecretWrapper(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (typeof nested === 'string' && nested && SECRET_JSON_KEYS.has(key.toLowerCase())) {
      out[key] = wrapEncrypted(nested, secret);
    } else {
      out[key] = encryptValueTree(nested, secret);
    }
  }
  return out;
}

export function decryptValueTree(value: unknown, secret: string): unknown {
  if (isEncryptedSecretWrapper(value)) {
    return decryptSecret(value.$enc, secret);
  }
  if (Array.isArray(value)) return value.map((item) => decryptValueTree(item, secret));
  if (!value || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    out[key] = decryptValueTree(nested, secret);
  }
  return out;
}

export function treeHasEncryptedSecrets(value: unknown): boolean {
  if (isEncryptedSecretWrapper(value)) return true;
  if (Array.isArray(value)) return value.some(treeHasEncryptedSecrets);
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some(treeHasEncryptedSecrets);
}

export function treeHasPlaintextSecrets(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(treeHasPlaintextSecrets);
  if (!value || typeof value !== 'object') return false;
  if (isEncryptedSecretWrapper(value)) return false;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (typeof nested === 'string' && nested && SECRET_JSON_KEYS.has(key.toLowerCase())) {
      return true;
    }
    if (treeHasPlaintextSecrets(nested)) return true;
  }
  return false;
}
