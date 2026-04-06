import { Worker, Job } from 'bullmq';
import { connection, QUEUE_NAME, ScanJobData, scanQueue } from '../lib/bullmq';
import { processLink } from '../lib/crawler/processor';
import { getDb, db as centralDb } from '../lib/db';
import { scans, links } from '../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import express from 'express';

console.log('Starting BullMQ Worker...');

// --- BullBoard Setup with Express ---
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(scanQueue)],
  serverAdapter,
});

const app = express();
app.use('/admin/queues', serverAdapter.getRouter());

const boardPort = 3001;
app.listen(boardPort, () => {
  console.log(`BullBoard UI running at http://localhost:${boardPort}/admin/queues`);
});

// --- Worker Logic ---
const worker = new Worker<ScanJobData>(
  QUEUE_NAME,
  async (job: Job<ScanJobData>) => {
    const { userId, scanId, url, depth, config, linkId } = job.data;
    
    console.log(`Processing Job ${job.id}: ${url} (Depth: ${depth})`);

    const userDb = getDb(userId);
    
    let link = linkId 
        ? await userDb.select().from(links).where(eq(links.id, linkId)).then(res => res[0])
        : await userDb.select().from(links).where(and(eq(links.scanId, scanId), eq(links.url, url))).then(res => res[0]);

    if (!link) {
      console.warn(`Link not found for URL ${url} in scan ${scanId}`);
      return;
    }

    const scan = await userDb.select().from(scans).where(eq(scans.id, scanId)).then(res => res[0]);
    if (!scan || scan.status !== 'RUNNING') {
      console.log(`Scan ${scanId} is not running. Skipping job.`);
      return;
    }

    const newLinks = await processLink(userDb, link, scan, config);

    if (newLinks && newLinks.length > 0) {
      console.log(`Found ${newLinks.length} new links for scan ${scanId}. Enqueuing...`);
      
      const jobs = newLinks.map(l => ({
        name: `scan-link-${l.id}`,
        data: {
          userId,
          scanId,
          url: l.url,
          depth: l.depth,
          config,
          linkId: l.id
        }
      }));

      await scanQueue.addBulk(jobs);
    }

    const pendingCount = await userDb.select({ id: links.id })
      .from(links)
      .where(and(eq(links.scanId, scanId), eq(links.status, 'PENDING')))
      .limit(1);

    if (pendingCount.length === 0) {
      console.log(`Scan ${scanId} appears to be completed.`);
      await userDb.update(scans).set({ status: 'COMPLETED', updatedAt: new Date() }).where(eq(scans.id, scanId));
    }
  },
  {
    connection,
    concurrency: parseInt(process.env.BULLMQ_CONCURRENCY || '10', 10),
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed!`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error: ${err.message}`);
});

process.on('SIGTERM', async () => {
  console.log('Worker shutting down...');
  await worker.close();
  process.exit(0);
});
