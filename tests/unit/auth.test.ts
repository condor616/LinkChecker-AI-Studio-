import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/auth/register/route';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    set: vi.fn(),
  })),
}));

// Mock provisionUserDb
vi.mock('@/lib/db/provisioning', () => ({
  provisionUserDb: vi.fn().mockResolvedValue(undefined),
}));

describe('Auth Registration', () => {
  beforeEach(async () => {
    // Clean up users table before each test
    await db.delete(users);
  });

  it('assigns ADMIN role to the first registered user', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'password123',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.user.role).toBe('ADMIN');

    const dbUser = await db.select().from(users).where(eq(users.email, 'admin@example.com')).then(res => res[0]);
    expect(dbUser?.role).toBe('ADMIN');
  });

  it('assigns PENDING role to the second registered user', async () => {
    // Register first user
    await db.insert(users).values({
      id: 'admin',
      email: 'admin@example.com',
      passwordHash: 'hash',
      role: 'ADMIN',
      createdAt: new Date(),
    });

    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'password123',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.user.role).toBe('PENDING');

    const dbUser = await db.select().from(users).where(eq(users.email, 'user@example.com')).then(res => res[0]);
    expect(dbUser?.role).toBe('PENDING');
  });
});
