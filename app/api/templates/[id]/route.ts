import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { templates } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    await db.delete(templates)
      .where(and(eq(templates.id, id), eq(templates.userId, session.id)))
      ;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const { name, config } = await req.json();

    if (!name || !config) {
      return NextResponse.json({ error: 'Name and config required' }, { status: 400 });
    }

    await db.update(templates)
      .set({ 
        name, 
        config: typeof config === 'string' ? config : JSON.stringify(config) 
      })
      .where(and(eq(templates.id, id), eq(templates.userId, session.id)))
      ;

    return NextResponse.json({ success: true, id, name });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
