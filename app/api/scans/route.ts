import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { scans, links } from '@/lib/db/schema';
import { startWorker } from '@/lib/crawler/worker';

export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    if (session.role === 'PENDING') {
      return NextResponse.json({ error: 'Account pending approval' }, { status: 403 });
    }

    const config = await req.json();
    const id = crypto.randomUUID();

    await db.insert(scans).values({
      id,
      userId: session.id,
      name: config.name || 'Untitled Scan',
      status: 'RUNNING',
      config: JSON.stringify(config),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Insert the starting URL
    if (config.startUrl) {
      await db.insert(links).values({
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
