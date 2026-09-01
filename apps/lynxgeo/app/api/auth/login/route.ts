import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { createToken, parseProductAccess, sessionCookieOptions } from '@lynx/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { LoginRequestSchema } from '@/lib/validation';
import { hashPassword, verifyPassword } from '@/lib/security/password';
import { enforceRateLimit, getClientIp } from '@/lib/security/rate-limit';

export async function POST(req: Request) {
  try {
    const { email, password } = LoginRequestSchema.parse(await req.json());

    const ip = getClientIp(req);
    const rateKey = `auth:login:${ip}`;
    const { limited, retryAfterSeconds } = enforceRateLimit(rateKey, 10, 15 * 60 * 1000);
    if (limited) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      );
    }

    const user = await db.select().from(users).where(eq(users.email, email)).then((r) => r[0]);
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    let isValidPassword = await verifyPassword(password, user.passwordHash);

    // One-time migration support for legacy base64-stored passwords.
    if (!isValidPassword) {
      const legacyHash = Buffer.from(password).toString('base64');
      if (legacyHash === user.passwordHash) {
        isValidPassword = true;
        const upgradedHash = await hashPassword(password);
        await db.update(users).set({ passwordHash: upgradedHash }).where(eq(users.id, user.id));
      }
    }

    if (!isValidPassword) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = await createToken({ id: user.id, role: user.role, email: user.email });
    (await cookies()).set('session', token, sessionCookieOptions());

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        productAccess: parseProductAccess(user.productAccess),
      },
    });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid request payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
