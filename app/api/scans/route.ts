import { NextResponse } from 'next/server';
import { requireApprovedUser } from '@/lib/auth';
import { getDb, db as centralDb } from '@/lib/db';
import { scans, links, users } from '@/lib/db/schema';
import { scanQueue } from '@/lib/bullmq';
import { scanLinkJobId } from '@/lib/crawler/scan-queue';
import { and, eq, sql } from 'drizzle-orm';
import { ScanConfigSchema } from '@/lib/validation/schemas';
import { enforceRateLimit, getClientIp } from '@/lib/security/rate-limit';

export async function POST(req: Request) {
  try {
    const session = await requireApprovedUser();

    const ip = getClientIp(req);
    const { limited, retryAfterSeconds } = enforceRateLimit(
      `scan:create:${session.id}:${ip}`,
      20,
      15 * 60 * 1000,
    );
    if (limited) {
      return NextResponse.json(
        { error: 'Too many scan requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      );
    }

    const config = ScanConfigSchema.parse(await req.json());
    const userDb = getDb(session.id);

    const [userRow] = await centralDb
      .select({ maxJobs: users.maxJobs })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);
    const maxJobs = userRow?.maxJobs ?? 1;
    const [{ count: runningCount }] = await userDb
      .select({ count: sql<number>`count(*)::int` })
      .from(scans)
      .where(and(eq(scans.userId, session.id), eq(scans.status, 'RUNNING')));
    if (Number(runningCount) >= maxJobs) {
      return NextResponse.json(
        { error: `Job limit reached (${maxJobs} concurrent scan${maxJobs === 1 ? '' : 's'}). Wait for a scan to finish or ask an admin to raise your limit.` },
        { status: 429 },
      );
    }

    const id = crypto.randomUUID();

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
    let initialLinkId: string;
    if (config.startUrl) {
      initialLinkId = crypto.randomUUID();
      await userDb.insert(links).values({
        id: initialLinkId,
        scanId: id,
        url: config.startUrl,
        status: 'PENDING',
      });

      // Enqueue the initial job
      await scanQueue.add(scanLinkJobId(initialLinkId), {
        userId: session.id,
        scanId: id,
        url: config.startUrl,
        depth: 0,
        config,
        linkId: initialLinkId
      }, { jobId: scanLinkJobId(initialLinkId) });
    }

    return NextResponse.json({ id });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid scan configuration', details: error.issues }, { status: 400 });
    }
    console.error('Failed to start scan:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
