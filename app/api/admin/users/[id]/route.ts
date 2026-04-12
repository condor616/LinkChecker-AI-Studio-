import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { deleteUserDb, provisionUserDb } from '@/lib/db/provisioning';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const updates = await req.json();
    const { id } = await params;

    console.log(`PATCH /api/admin/users/${id} called with updates:`, updates);
    const result = await db.update(users).set(updates).where(eq(users.id, id));
    console.log(`Update result for user ${id}:`, result);

    // If the role is being updated to an active one, trigger provisioning
    if (updates.role === 'USER' || updates.role === 'ADMIN') {
        console.log(`Triggering provisioning for user ${id}`);
        process.nextTick(() => {
            provisionUserDb(id).catch(err => {
                console.error(`Deferred provisioning failed for ${id}:`, err);
            });
        });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;

    // 1. Delete the user-specific database
    try {
        await deleteUserDb(id);
    } catch (e) {
        console.error(`Failed to delete user database for ${id}:`, e);
        // We continue to delete the user record even if DB deletion fails? 
        // Better to fail if DB is still there? 
        // For robustness, let's just log it and proceed with user record deletion.
    }
    
    // 2. Delete the user record from central DB
    await db.delete(users).where(eq(users.id, id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
