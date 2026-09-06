import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { passwordResetTokens, users } from '@/lib/db/schema';
import { ForgotPasswordSchema } from '@/lib/validation/schemas';
import { enforceRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { generateResetToken, newResetTokenId, PASSWORD_RESET_TTL_MS } from '@/lib/security/password-reset';
import { sendPasswordResetEmail } from '@/lib/email';

const GENERIC_SUCCESS = { success: true };

export async function POST(req: Request) {
  try {
    const { email } = ForgotPasswordSchema.parse(await req.json());
    const ip = getClientIp(req);
    const { limited, retryAfterSeconds } = enforceRateLimit(`auth:forgot:${ip}`, 5, 15 * 60 * 1000);
    if (limited) {
      return NextResponse.json(
        { error: 'Too many reset attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      );
    }

    const user = await db.select().from(users).where(eq(users.email, email)).then((res) => res[0]);
    if (!user) {
      return NextResponse.json(GENERIC_SUCCESS);
    }

    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

    const { token, tokenHash } = generateResetToken();
    await db.insert(passwordResetTokens).values({
      id: newResetTokenId(),
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });

    void sendPasswordResetEmail(user.email, token).catch((err) => {
      console.error('Failed to send password reset email:', err);
    });

    return NextResponse.json(GENERIC_SUCCESS);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid request payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
