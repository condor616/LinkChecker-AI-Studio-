import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { templates } from '@/lib/db/schema';
import { requireApprovedUser } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

export async function GET() {
  try {
    const session = await requireApprovedUser();
    const userDb = getDb(session.id);
    const userTemplates = await userDb.select().from(templates).where(eq(templates.userId, session.id));
    return NextResponse.json(userTemplates);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireApprovedUser();
    const { name, config } = await req.json();
    const userDb = getDb(session.id);

    if (!name || !config) {
      return NextResponse.json({ error: 'Name and config required' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await userDb.insert(templates).values({
      id,
      userId: session.id,
      name,
      config: typeof config === 'string' ? config : JSON.stringify(config),
      createdAt: new Date(),
    });

    return NextResponse.json({ id, name });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
