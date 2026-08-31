import { SignJWT, jwtVerify } from 'jose';

export function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long');
  }

  return new TextEncoder().encode(secret);
}

export type TokenPayload = { id: string; role: string; email: string };

export async function createToken(payload: TokenPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getJwtSecretKey());
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  const domain = process.env.AUTH_COOKIE_DOMAIN;
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 60 * 60 * 24,
    ...(domain ? { domain } : {}),
  };
}
