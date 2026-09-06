import { NextResponse } from 'next/server';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { passwordResetTokens, users } from '@/lib/db/schema';
import { ResetPasswordSchema } from '@/lib/validation/schemas';
import { enforceRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { hashResetToken } from '@/lib/security/password-reset';
import { hashPassword } from '@/lib/security/password';

export async function POST(req: Request) {
  try {
    const { token, password } = ResetPasswordSchema.parse(await req.json());
    const ip = getClientIp(req);
    const { limited, retryAfterSeconds } = enforceRateLimit(`auth:reset:${ip}`, 10, 15 * 60 * 1000);
    if (limited) {
      return NextResponse.json(
        { error: 'Too many reset attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      );
    }

    const tokenHash = hashResetToken(token);
    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    const resetRow = rows[0];
    if (!resetRow) {
      return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    await db.update(users).set({ passwordHash }).where(eq(users.id, resetRow.userId));
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetRow.id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid request payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
