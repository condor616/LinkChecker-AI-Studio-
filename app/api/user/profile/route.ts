import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { hashPassword } from '@/lib/security/password';
import { ProfilePasswordUpdateSchema } from '@/lib/validation/schemas';

export async function PATCH(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { password } = ProfilePasswordUpdateSchema.parse(await req.json());
    const passwordHash = await hashPassword(password);

    await db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, session.id))
      ;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid request payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
