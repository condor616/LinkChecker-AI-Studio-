import { getDb } from '@/lib/db';
import { users, scans, links, templates } from '@/lib/db/schema';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.test') });

async function main() {
    const db = getDb(); // Use base DB connection from DATABASE_URL

    console.log('Wiping test database tables...');
    
    // The order matters if there are FKs (scans -> user, links -> scan)
    // But since we removed FKs in multi-db, we just delete all
    await db.delete(links);
    await db.delete(scans);
    await db.delete(templates);
    await db.delete(users);
    
    console.log('Test database wiped successfully.');
    process.exit(0);
}

main().catch(err => {
    console.error('Failed to wipe test database:', err);
    process.exit(1);
});
