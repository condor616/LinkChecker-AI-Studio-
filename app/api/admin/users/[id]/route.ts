import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, scans, templates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const updates = await req.json();
    const { id } = await params;

    db.update(users).set(updates).where(eq(users.id, id)).run();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;

    // Delete associated data first (since we don't have cascade on scans/templates in schema)
    db.delete(scans).where(eq(scans.userId, id)).run();
    db.delete(templates).where(eq(templates.userId, id)).run();
    
    // Delete the user
    db.delete(users).where(eq(users.id, id)).run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
