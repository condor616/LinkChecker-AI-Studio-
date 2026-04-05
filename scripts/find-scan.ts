import { getDb } from './lib/db';
import { scans, users } from './lib/db/schema';
import { eq } from 'drizzle-orm';

async function findScan() {
    const db = getDb(); // main db to find users
    const allUsers = await db.select().from(users);
    
    for (const user of allUsers) {
        const userDb = getDb(user.id);
        const userScans = await userDb.select().from(scans);
        if (userScans.length > 0) {
            console.log(`User: ${user.email} (ID: ${user.id})`);
            console.log(`Scan: ${userScans[0].name} (ID: ${userScans[0].id})`);
            return;
        }
    }
    console.log('No scans found');
}

findScan();
