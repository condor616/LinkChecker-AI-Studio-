import { NextResponse } from 'next/server';
import { requireApprovedUser } from '@/lib/auth';
import { getDb, db as centralDb } from '@/lib/db';
import { scans, links, users } from '@/lib/db/schema';
import { startWorker } from '@/lib/crawler/worker';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
  try {
    const session = await requireApprovedUser();

    const config = await req.json();
    const id = crypto.randomUUID();
    const userDb = getDb(session.id);

    await userDb.insert(scans).values({
      id,
      userId: session.id,
      name: config.name || 'Untitled Scan',
      status: 'RUNNING',
      config: JSON.stringify(config),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Mark user as having an active scan in central DB
    await centralDb.update(users).set({ hasActiveScan: true }).where(eq(users.id, session.id));

    // Insert the starting URL
    if (config.startUrl) {
      await userDb.insert(links).values({
        id: crypto.randomUUID(),
        scanId: id,
        url: config.startUrl,
        status: 'PENDING',
      });
    }

    // Ensure worker is running
    startWorker();

    return NextResponse.json({ id });
  } catch (error: any) {
    console.error('Failed to start scan:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
