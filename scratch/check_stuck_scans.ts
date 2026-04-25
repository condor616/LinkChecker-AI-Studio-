import { getDb, db as centralDb } from '../lib/db';
import { scans, links, users } from '../lib/db/schema';
import { eq, and, or } from 'drizzle-orm';

async function checkScans() {
  const allUsers = await centralDb.select().from(users);
  console.log(`Total users found: ${allUsers.length}`);

  for (const user of allUsers) {
    console.log(`Checking scans for user: ${user.email} (ID: ${user.id})`);
    const userDb = getDb(user.id);
    const userScans = await userDb.select().from(scans);
    console.log(` - Scans found: ${userScans.length}`);

    for (const scan of userScans) {
      if (scan.status === 'RUNNING' || scan.status === 'PAUSED') {
        const activeLinks = await userDb.select()
          .from(links)
          .where(and(
            eq(links.scanId, scan.id),
            or(eq(links.status, 'PENDING'), eq(links.status, 'PROCESSING'))
          ));

        console.log(`   [${scan.status}] Scan ID: ${scan.id} (${scan.name})`);
        console.log(`   Active Links Count: ${activeLinks.length}`);
        
        if (activeLinks.length > 0) {
          console.log(`   First 5 active links:`);
          activeLinks.slice(0, 5).forEach(l => {
            console.log(`    - [${l.status}] ${l.url}`);
          });

          // Cleanup: Mark as COMPLETED if we think it should be done.
          console.log(`   FIXING: Marking scan as COMPLETED...`);
          await userDb.update(scans).set({ status: 'COMPLETED', updatedAt: new Date() }).where(eq(scans.id, scan.id));
        } else {
          console.log(`   NO ACTIVE LINKS FOUND! Marking as COMPLETED.`);
          await userDb.update(scans).set({ status: 'COMPLETED', updatedAt: new Date() }).where(eq(scans.id, scan.id));
        }
      } else {
        console.log(`   [${scan.status}] Scan ID: ${scan.id} (${scan.name})`);
      }
    }
    console.log('---');
  }
}

checkScans().catch(console.error);
