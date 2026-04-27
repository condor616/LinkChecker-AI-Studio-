import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

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
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const user = await db.select().from(users).where(eq(users.email, email)).then(res => res[0]);
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const passwordHash = Buffer.from(password).toString('base64');
    if (user.passwordHash !== passwordHash) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = await createToken({ id: user.id, role: user.role, email: user.email });
    const cookieStore = await cookies();
    cookieStore.set('session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
    });

    return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
