import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [user] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, session.id));
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const preferences = user.preferences ? JSON.parse(user.preferences) : {};
    return NextResponse.json({ preferences });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { preferences } = await req.json();
    
    // Validate preferences (basic check)
    if (!preferences || typeof preferences !== 'object') {
      return NextResponse.json({ error: 'Invalid preferences format' }, { status: 400 });
    }

    // Get current preferences to merge
    const [user] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, session.id));
    const currentPrefs = user?.preferences ? JSON.parse(user.preferences) : {};
    
    const mergedPrefs = { ...currentPrefs, ...preferences };

    await db.update(users)
      .set({ preferences: JSON.stringify(mergedPrefs) })
      .where(eq(users.id, session.id));

    return NextResponse.json({ success: true, preferences: mergedPrefs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
