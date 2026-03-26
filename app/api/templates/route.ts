import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { templates } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const session = await requireAuth();
    const userTemplates = db.select().from(templates).where(eq(templates.userId, session.id)).all();
    return NextResponse.json(userTemplates);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    const { name, config } = await req.json();

    if (!name || !config) {
      return NextResponse.json({ error: 'Name and config required' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    db.insert(templates).values({
      id,
      userId: session.id,
      name,
      config: typeof config === 'string' ? config : JSON.stringify(config),
      createdAt: new Date(),
    }).run();

    return NextResponse.json({ id, name });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
