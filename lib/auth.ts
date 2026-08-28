import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import { provisionUserDb } from './db/provisioning';
import { getJwtSecretKey } from './security/jwt';

export async function createToken(payload: { id: string; role: string; email: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getJwtSecretKey());
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    return payload as { id: string; role: string; email: string };
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  // Guard against ghost sessions (e.g. after a DB nuke or user deletion)
  try {
    const res = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, payload.id)).limit(1);
    if (res.length === 0) {
      return null;
    }
    // Update role just in case it changed since the JWT was issued
    payload.role = res[0].role;
    return payload;
  } catch (error) {
    console.error("Session DB check failed (DB likely offline):", error);
    return payload;
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
  // Provision DB for admin too (they have their own scans)
  await provisionUserDb(session.id).catch(err => {
    console.error(`Admin DB Provisioning failed for ${session.id}:`, err);
  });
  return session;
}

export async function requireApprovedUser() {
  const session = await requireAuth();
  if (session.role !== 'ADMIN' && session.role !== 'USER') {
    throw new Error('Forbidden: Your account is pending approval.');
  }
  // Trigger DB provisioning for the user
  await provisionUserDb(session.id).catch(err => {
    console.error(`User DB Provisioning failed for ${session.id}:`, err);
  });
  return session;
}
