import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { email, password, checkOnly } = await req.json();

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

    // Simple hash for local dev (in prod use bcrypt/argon2)
    const passwordHash = Buffer.from(password).toString('base64');
    const id = crypto.randomUUID();
    const role = isFirstUser ? 'ADMIN' : 'PENDING';

    await db.insert(users).values({
      id,
      email,
      passwordHash,
      role,
      maxJobs: 1,
      createdAt: new Date(),
    });

    const token = await createToken({ id, role, email });
    const cookieStore = await cookies();
    cookieStore.set('session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
    });

    return NextResponse.json({ user: { id, email, role } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
