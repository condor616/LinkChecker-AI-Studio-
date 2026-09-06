import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { parseProductAccess, stringifyProductAccess } from '@lynx/auth';
import { provisionGeoDb, deleteGeoDb } from '@/lib/db/provisioning';
import { notifyUserApproved } from '@/lib/email';

const UpdateSchema = z.object({
  role: z.enum(['ADMIN', 'USER', 'PENDING', 'BLOCKED']).optional(),
  maxJobs: z.number().int().min(1).max(100).optional(),
  productAccess: z.object({ lynxscan: z.boolean().optional(), lynxgeo: z.boolean().optional() }).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const parsed = UpdateSchema.parse(await req.json());
    const { productAccess, ...rest } = parsed;
    const updates: Record<string, unknown> = { ...rest };
    const current = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const previous = current[0];
    if (!previous) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (productAccess) {
      updates.productAccess = stringifyProductAccess({
        ...parseProductAccess(previous.productAccess),
        ...productAccess,
      });
    }
    await db.update(users).set(updates).where(eq(users.id, id));
    if (productAccess?.lynxgeo || updates.role === 'ADMIN' || updates.role === 'USER') {
      provisionGeoDb(id).catch(() => {});
    }
    if (previous.role === 'PENDING' && (updates.role === 'USER' || updates.role === 'ADMIN')) {
      void notifyUserApproved(previous.email).catch((err) => {
        console.error('Failed to send approval email:', err);
      });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    await deleteGeoDb(id).catch(() => {});
    await db.delete(users).where(eq(users.id, id));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
