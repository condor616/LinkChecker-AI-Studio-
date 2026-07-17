import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { provisionUserDb } from '@/lib/db/provisioning';
import { hashPassword } from '@/lib/security/password';
import { enforceRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { RegisterRequestSchema } from '@/lib/validation/schemas';

export async function POST(req: Request) {
  try {
    const body = RegisterRequestSchema.parse(await req.json());
    const { email, password, checkOnly } = body;

    const ip = getClientIp(req);
    const rateKey = `auth:register:${ip}`;
    const { limited, retryAfterSeconds } = enforceRateLimit(rateKey, 5, 15 * 60 * 1000);
    if (limited) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      );
    }

    // If migrations are supposed to run, wait for them to finish
    if (process.env.RUN_MIGRATIONS === 'true') {
        const { isDbReady } = await import('@/lib/db/migrate');
        let attempts = 0;
        while (!isDbReady() && attempts < 10) {
            console.log('⏳ Waiting for migrations to complete before serving request...');
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
    }

    // Check if any users exist
    const allUsers = await db.select().from(users);
    const isFirstUser = allUsers.length === 0;


    if (checkOnly) {
        return NextResponse.json({ exists: !isFirstUser });
    }

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    // Check if user already exists
    const existing = await db.select().from(users).where(eq(users.email, email)).then(res => res[0]);
    if (existing) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const id = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const role = isFirstUser ? 'ADMIN' : 'PENDING';

    await db.insert(users).values({
      id,
      email,
      passwordHash,
      role,
      maxJobs: 1,
      createdAt: new Date(),
    });

    // Provision the user's private database immediately ONLY if they are the first user (ADMIN)
    if (role === 'ADMIN') {
        await provisionUserDb(id).catch(err => {
            console.error(`Failed to provision DB for ${id}:`, err);
        });
    }

    const token = await createToken({ id, role, email });
    const cookieStore = await cookies();
    cookieStore.set('session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    });

    return NextResponse.json({ user: { id, email, role } });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid request payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
