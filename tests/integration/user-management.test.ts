import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '../../lib/db';
import { users, scans } from '../../lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { provisionUserDb, deleteUserDb } from '../../lib/db/provisioning';

describe('User Management Integration', () => {
    const db = getDb();
    const testUserId = 'test-managed-user';
    const adminUserId = 'test-admin-user';

    beforeAll(async () => {
        // Cleanup if exists
        await db.delete(users).where(eq(users.id, testUserId));
        await db.delete(users).where(eq(users.id, adminUserId));

        // Create a test user
        await db.insert(users).values({
            id: testUserId,
            email: 'test-user@example.com',
            passwordHash: 'hash',
            role: 'PENDING',
            createdAt: new Date()
        });
    });

    afterAll(async () => {
        await db.delete(users).where(eq(users.id, testUserId));
        await deleteUserDb(testUserId).catch(() => {});
    });

    it('should update user role (approve user)', async () => {
        // Simulate the PATCH /api/admin/users/[id]
        const updates = { role: 'USER' };
        await db.update(users).set(updates).where(eq(users.id, testUserId));

        const updatedUser = await db.select().from(users).where(eq(users.id, testUserId)).then(res => res[0]);
        expect(updatedUser.role).toBe('USER');
    });

    it('should update max jobs for a user', async () => {
        const updates = { maxJobs: 5 };
        await db.update(users).set(updates).where(eq(users.id, testUserId));

        const updatedUser = await db.select().from(users).where(eq(users.id, testUserId)).then(res => res[0]);
        expect(updatedUser.maxJobs).toBe(5);
    });

    it('should block a user', async () => {
        const updates = { role: 'BLOCKED' };
        await db.update(users).set(updates).where(eq(users.id, testUserId));

        const updatedUser = await db.select().from(users).where(eq(users.id, testUserId)).then(res => res[0]);
        expect(updatedUser.role).toBe('BLOCKED');
    });

    it('should fetch user associations (mocked)', async () => {
        // We'll just verify the DB provisioning works and we can query scans/templates
        await provisionUserDb(testUserId);
        const userDb = getDb(testUserId);
        
        // Should be empty initially
        const scanRes = await userDb.select({ count: sql`count(*)` }).from(scans);
        expect(Number(scanRes[0].count)).toBe(0);
    });

    it('should delete a user and their database', async () => {
        // This is what the DELETE /api/admin/users/[id] does
        await deleteUserDb(testUserId);
        await db.delete(users).where(eq(users.id, testUserId));

        const deletedUser = await db.select().from(users).where(eq(users.id, testUserId)).then(res => res[0]);
        expect(deletedUser).toBeUndefined();
    });
});
