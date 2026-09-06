import { createHash, randomBytes } from 'crypto';

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newResetTokenId(): string {
  return randomBytes(16).toString('hex');
}
