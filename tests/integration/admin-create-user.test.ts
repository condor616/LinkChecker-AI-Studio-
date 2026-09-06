import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { POST as createUser } from '@/app/api/admin/users/route';
import { PATCH as updateProfile } from '@/app/api/user/profile/route';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { hashPassword, verifyPassword } from '@/lib/security/password';

vi.mock('@/lib/auth', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: 'admin-create-test', role: 'ADMIN', email: 'admin-create@example.com' }),
  getSession: vi.fn().mockResolvedValue({ id: 'profile-pw-user', role: 'USER', email: 'profile-pw@example.com' }),
}));

vi.mock('@/lib/db/provisioning', () => ({
  provisionUserDb: vi.fn().mockResolvedValue(undefined),
  provisionGeoDb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/email', () => ({
  notifyUserAccountCreated: vi.fn().mockResolvedValue(undefined),
  notifyUserApproved: vi.fn().mockResolvedValue(undefined),
  notifyAdminsOfPendingSignup: vi.fn().mockResolvedValue(undefined),
}));

const createdId = 'created_user_example_com';

describe('Admin create user and profile password', () => {
  beforeEach(async () => {
    await db.delete(users).where(eq(users.id, createdId));
    await db.delete(users).where(eq(users.id, 'profile-pw-user'));
    await db.insert(users).values({
      id: 'profile-pw-user',
      email: 'profile-pw@example.com',
      passwordHash: await hashPassword('current-pass-9'),
      role: 'USER',
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, createdId));
    await db.delete(users).where(eq(users.id, 'profile-pw-user'));
  });

  it('creates a user from the admin API', async () => {
    const res = await createUser(
      new Request('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: 'created.user@example.com',
          password: 'created-pass-9',
          confirmPassword: 'created-pass-9',
          role: 'USER',
          maxJobs: 3,
          productAccess: { lynxscan: true, lynxgeo: false },
        }),
      }),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.user.email).toBe('created.user@example.com');
    expect(data.user.role).toBe('USER');

    const row = await db.select().from(users).where(eq(users.id, createdId)).then((rows) => rows[0]);
    expect(row).toBeTruthy();
    expect(await verifyPassword('created-pass-9', row.passwordHash)).toBe(true);
  });

  it('rejects profile password change with the wrong current password', async () => {
    const res = await updateProfile(
      new Request('http://localhost/api/user/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: 'wrong-pass-9',
          password: 'brand-new-99',
          confirmPassword: 'brand-new-99',
        }),
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/current password/i);
  });

  it('updates the profile password when the current password matches', async () => {
    const res = await updateProfile(
      new Request('http://localhost/api/user/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: 'current-pass-9',
          password: 'brand-new-99',
          confirmPassword: 'brand-new-99',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const row = await db.select().from(users).where(eq(users.id, 'profile-pw-user')).then((rows) => rows[0]);
    expect(await verifyPassword('brand-new-99', row.passwordHash)).toBe(true);
  });
});
