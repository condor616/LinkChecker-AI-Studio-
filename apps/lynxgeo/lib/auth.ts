import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { createToken, verifyToken, parseProductAccess, hasProductAccess, type ProductAccess } from '@lynx/auth';
import { db } from './db';
import { users } from './db/schema';
import { provisionGeoDb } from './db/provisioning';

export { createToken, verifyToken };

export type Session = {
  id: string;
  role: string;
  email: string;
  productAccess: ProductAccess;
};

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get('session')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  try {
    const res = await db
      .select({ id: users.id, role: users.role, email: users.email, productAccess: users.productAccess })
      .from(users)
      .where(eq(users.id, payload.id))
      .limit(1);
    if (!res[0]) return null;
    return {
      id: res[0].id,
      role: res[0].role,
      email: res[0].email,
      productAccess: parseProductAccess(res[0].productAccess),
    };
  } catch {
    return { id: payload.id, role: payload.role, email: payload.email, productAccess: parseProductAccess(null) };
  }
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  if (session.role !== 'ADMIN') throw new Error('Forbidden');
  return session;
}

export function geoAuthHttpStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : '';
  if (message === 'Unauthorized') return 401;
  if (message.startsWith('Forbidden')) return 403;
  return 400;
}

export async function requireGeoUser() {
  const session = await requireAuth();
  if (session.role !== 'ADMIN' && session.role !== 'USER') {
    throw new Error('Forbidden: Your account is pending approval.');
  }
  if (!hasProductAccess(session.productAccess, 'lynxgeo')) {
    throw new Error('Forbidden: You do not have access to Lynx GEO.');
  }
  await provisionGeoDb(session.id);
  return session;
}
