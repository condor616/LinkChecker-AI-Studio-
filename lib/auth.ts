import { cookies } from 'next/headers';
import { db } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import { provisionUserDb } from './db/provisioning';
import {
  createToken,
  verifyToken,
  parseProductAccess,
  hasProductAccess,
  type ProductAccess,
  type ProductId,
} from '@lynx/auth';

export { createToken, verifyToken };

export type Session = {
  id: string;
  role: string;
  email: string;
  productAccess: ProductAccess;
};

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  try {
    const res = await db
      .select({ id: users.id, role: users.role, email: users.email, productAccess: users.productAccess })
      .from(users)
      .where(eq(users.id, payload.id))
      .limit(1);
    if (res.length === 0) {
      return null;
    }
    return {
      id: res[0].id,
      role: res[0].role,
      email: res[0].email,
      productAccess: parseProductAccess(res[0].productAccess),
    };
  } catch (error) {
    console.error('Session DB check failed (DB likely offline):', error);
    return {
      id: payload.id,
      role: payload.role,
      email: payload.email,
      productAccess: parseProductAccess(null),
    };
  }
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  if (session.role !== 'ADMIN') {
    throw new Error('Forbidden');
  }
  await provisionUserDb(session.id).catch((err) => {
    console.error(`Admin DB Provisioning failed for ${session.id}:`, err);
  });
  return session;
}

export async function requireApprovedUser() {
  const session = await requireAuth();
  if (session.role !== 'ADMIN' && session.role !== 'USER') {
    throw new Error('Forbidden: Your account is pending approval.');
  }
  if (session.role !== 'ADMIN' && !hasProductAccess(session.productAccess, 'lynxscan')) {
    throw new Error('Forbidden: You do not have access to LynxScan.');
  }
  await provisionUserDb(session.id).catch((err) => {
    console.error(`User DB Provisioning failed for ${session.id}:`, err);
  });
  return session;
}

export async function requireProduct(product: ProductId) {
  const session = await requireAuth();
  if (session.role !== 'ADMIN' && session.role !== 'USER') {
    throw new Error('Forbidden: Your account is pending approval.');
  }
  if (session.role !== 'ADMIN' && !hasProductAccess(session.productAccess, product)) {
    throw new Error(`Forbidden: You do not have access to ${product}.`);
  }
  return session;
}
