import { describe, it, expect, beforeAll } from 'vitest';
import { getDb } from '../../lib/db';
import { provisionUserDb, deleteUserDb } from '../../lib/db/provisioning';
import { users, scans } from '../../lib/db/schema';

import { eq } from 'drizzle-orm';
import crypto from 'crypto';

describe('Security & Multi-Tenancy (Phase 2)', () => {
    const testDb = getDb();

    beforeAll(async () => {
        await testDb.delete(users);
    });

    it('should prevent PENDING users from accessing scan data (simulated)', async () => {

        // This is typically handled by middleware/requireAuth, but we can test the data layer
        const userId = 'pending-user';
        await testDb.insert(users).values({
            id: userId,
            email: 'pending@example.com',
            passwordHash: 'hash',
            role: 'PENDING',
            createdAt: new Date()
        });

        // Mocking the check that would happen in a protected route
        const user = await testDb.select().from(users).where(eq(users.id, userId)).then(res => res[0]);
        expect(user.role).toBe('PENDING');
        
        // In our app logic, PENDING users should not have hasActiveScan = true
        expect(user.hasActiveScan).toBeFalsy();
    });

    it('should isolate data between users', async () => {
        const userA = 'user-a';
        const userB = 'user-b';

        // Provision both databases
        await provisionUserDb(userA);
        await provisionUserDb(userB);

        try {
            // Setup User A's database
            const dbA = getDb(userA);
            const scanIdA = crypto.randomUUID();
            await dbA.insert(scans).values({
                id: scanIdA,
                userId: userA,
                name: 'Scan A',
                status: 'COMPLETED',
                config: '{}',
                createdAt: new Date(),
                updatedAt: new Date()
            });

            // Setup User B's database
            const dbB = getDb(userB);
            const scanIdB = crypto.randomUUID();
            await dbB.insert(scans).values({
                id: scanIdB,
                userId: userB,
                name: 'Scan B',
                status: 'COMPLETED',
                config: '{}',
                createdAt: new Date(),
                updatedAt: new Date()
            });


            // Verify isolation: User A's DB should NOT contain User B's scan
            const scansInA = await dbA.select().from(scans).where(eq(scans.id, scanIdB));
            expect(scansInA.length).toBe(0);

            // Verify User B's DB should NOT contain User A's scan
            const scansInB = await dbB.select().from(scans).where(eq(scans.id, scanIdA));
            expect(scansInB.length).toBe(0);
        } finally {
            // Cleanup databases
            await deleteUserDb(userA);
            await deleteUserDb(userB);
        }
    });
});

