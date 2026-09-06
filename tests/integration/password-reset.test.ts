import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { POST as resetPassword } from '@/app/api/auth/reset-password/route';
import { db } from '@/lib/db';
import { passwordResetTokens, users } from '@/lib/db/schema';
import { generateResetToken, newResetTokenId, PASSWORD_RESET_TTL_MS } from '@/lib/security/password-reset';
import { hashPassword, verifyPassword } from '@/lib/security/password';

const userId = 'reset-token-user';
const email = 'reset-token@example.com';

describe('Password reset tokens', () => {
  beforeEach(async () => {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    await db.insert(users).values({
      id: userId,
      email,
      passwordHash: await hashPassword('old-password-9'),
      role: 'USER',
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('consumes a reset token only once', async () => {
    const { token, tokenHash } = generateResetToken();
    await db.insert(passwordResetTokens).values({
      id: newResetTokenId(),
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });

    const first = await resetPassword(
      new Request('http://localhost/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token,
          password: 'new-password-9',
          confirmPassword: 'new-password-9',
        }),
      }),
    );
    expect(first.status).toBe(200);

    const user = await db.select().from(users).where(eq(users.id, userId)).then((rows) => rows[0]);
    expect(await verifyPassword('new-password-9', user.passwordHash)).toBe(true);

    const second = await resetPassword(
      new Request('http://localhost/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token,
          password: 'another-password-9',
          confirmPassword: 'another-password-9',
        }),
      }),
    );
    expect(second.status).toBe(400);
    const after = await db.select().from(users).where(eq(users.id, userId)).then((rows) => rows[0]);
    expect(await verifyPassword('new-password-9', after.passwordHash)).toBe(true);
  });
});
