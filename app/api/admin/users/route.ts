import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { hashPassword } from '@/lib/security/password';
import { AdminUserCreateSchema } from '@/lib/validation/schemas';
import { parseProductAccess, stringifyProductAccess, ADMIN_PRODUCT_ACCESS, DEFAULT_PRODUCT_ACCESS } from '@lynx/auth';
import { provisionUserDb, provisionGeoDb } from '@/lib/db/provisioning';
import { notifyUserAccountCreated } from '@/lib/email';

export async function GET() {
  try {
    await requireAdmin();
    const allUsers = await db.select().from(users);
    return NextResponse.json({ users: allUsers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = AdminUserCreateSchema.parse(await req.json());
    const existing = await db.select().from(users).where(eq(users.email, body.email)).then((res) => res[0]);
    if (existing) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    const id = body.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const idTaken = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).then((res) => res[0]);
    if (idTaken) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    const baseAccess = body.role === 'ADMIN' ? ADMIN_PRODUCT_ACCESS : DEFAULT_PRODUCT_ACCESS;
    const productAccess = stringifyProductAccess({
      ...baseAccess,
      ...body.productAccess,
      ...(body.role === 'ADMIN' ? ADMIN_PRODUCT_ACCESS : {}),
    });
    const passwordHash = await hashPassword(body.password);

    await db.insert(users).values({
      id,
      email: body.email,
      passwordHash,
      role: body.role,
      maxJobs: body.maxJobs,
      productAccess,
      createdAt: new Date(),
    });

    if (body.role === 'USER' || body.role === 'ADMIN') {
      process.nextTick(() => {
        provisionUserDb(id).catch((err) => {
          console.error(`Deferred provisioning failed for ${id}:`, err);
        });
      });
    }
    const parsedAccess = parseProductAccess(productAccess);
    if (parsedAccess.lynxgeo || body.role === 'ADMIN') {
      process.nextTick(() => {
        provisionGeoDb(id).catch((err) => {
          console.error(`Deferred GEO provisioning failed for ${id}:`, err);
        });
      });
    }

    if (body.sendWelcomeEmail) {
      void notifyUserAccountCreated(body.email).catch((err) => {
        console.error('Failed to send welcome email:', err);
      });
    }

    return NextResponse.json({
      user: {
        id,
        email: body.email,
        role: body.role,
        maxJobs: body.maxJobs,
        productAccess: parsedAccess,
        createdAt: new Date(),
      },
    });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid request payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
