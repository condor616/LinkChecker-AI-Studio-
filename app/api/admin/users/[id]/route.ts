import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { deleteUserDb, provisionUserDb, provisionGeoDb } from '@/lib/db/provisioning';
import { AdminUserUpdateSchema } from '@/lib/validation/schemas';
import { parseProductAccess, stringifyProductAccess } from '@lynx/auth';
import { notifyUserApproved } from '@/lib/email';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const parsed = AdminUserUpdateSchema.parse(await req.json());
    const { id } = await params;
    const { productAccess, ...rest } = parsed;
    const updates: Record<string, unknown> = { ...rest };
    const current = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const previous = current[0];
    if (!previous) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (productAccess) {
      const mergedAccess = { ...parseProductAccess(previous.productAccess), ...productAccess };
      updates.productAccess = stringifyProductAccess(mergedAccess);
    }

    await db.update(users).set(updates).where(eq(users.id, id));

    if (updates.role === 'USER' || updates.role === 'ADMIN') {
      process.nextTick(() => {
        provisionUserDb(id).catch((err) => {
          console.error(`Deferred provisioning failed for ${id}:`, err);
        });
      });
    }
    if (productAccess?.lynxgeo || updates.role === 'ADMIN') {
      process.nextTick(() => {
        provisionGeoDb(id).catch((err) => {
          console.error(`Deferred GEO provisioning failed for ${id}:`, err);
        });
      });
    }

    if (
      previous.role === 'PENDING' &&
      (updates.role === 'USER' || updates.role === 'ADMIN')
    ) {
      void notifyUserApproved(previous.email).catch((err) => {
        console.error('Failed to send approval email:', err);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid update payload', details: error.issues }, { status: 400 });
    }
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
