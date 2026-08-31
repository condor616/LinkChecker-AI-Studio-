import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { parseProductAccess, stringifyProductAccess } from '@lynx/auth';
import { provisionGeoDb, deleteGeoDb } from '@/lib/db/provisioning';

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
    if (productAccess) {
      const current = await db.select().from(users).where(eq(users.id, id)).limit(1);
      updates.productAccess = stringifyProductAccess({
        ...parseProductAccess(current[0]?.productAccess),
        ...productAccess,
      });
    }
    await db.update(users).set(updates).where(eq(users.id, id));
    if (productAccess?.lynxgeo || updates.role === 'ADMIN') {
      provisionGeoDb(id).catch(() => {});
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
