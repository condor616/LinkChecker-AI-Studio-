import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { createToken, sessionCookieOptions } from '@lynx/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { LoginRequestSchema } from '@/lib/validation';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const { email, password } = LoginRequestSchema.parse(await req.json());
    const user = await db.select().from(users).where(eq(users.email, email)).then((r) => r[0]);
    if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    const token = await createToken({ id: user.id, role: user.role, email: user.email });
    (await cookies()).set('session', token, sessionCookieOptions());
    return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
