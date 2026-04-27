import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { provisionUserDb } from '@/lib/db/provisioning';

export async function POST(req: Request) {
  try {
    const { email, password, checkOnly } = await req.json();

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

    // Simple hash for local dev (in prod use bcrypt/argon2)
    const passwordHash = Buffer.from(password).toString('base64');
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
      sameSite: 'none',
      path: '/',
    });

    return NextResponse.json({ user: { id, email, role } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
