import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/security/password';
import { ProfilePasswordUpdateSchema } from '@/lib/validation/schemas';

export async function PATCH(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { currentPassword, password } = ProfilePasswordUpdateSchema.parse(await req.json());
    const current = await db.select().from(users).where(eq(users.id, session.id)).limit(1);
    const user = current[0];
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let currentValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!currentValid) {
      const legacyHash = Buffer.from(currentPassword).toString('base64');
      currentValid = legacyHash === user.passwordHash;
    }
    if (!currentValid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    await db.update(users).set({ passwordHash }).where(eq(users.id, session.id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid request payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
