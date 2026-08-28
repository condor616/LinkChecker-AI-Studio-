import { Worker, Job } from 'bullmq';
import { connection, QUEUE_NAME, ScanJobData, scanQueue } from '../lib/bullmq';
import { processLink } from '../lib/crawler/processor';
import { getDb, db as centralDb } from '../lib/db';
import { scans, links } from '../lib/db/schema';
import { isTargetUrlMatch } from '../lib/utils/url';
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
    
    const linkResult = linkId 
        ? await userDb.select().from(links).where(eq(links.id, linkId)).limit(1)
        : await userDb.select().from(links).where(and(eq(links.scanId, scanId), eq(links.url, url))).limit(1);

    const link = linkResult[0];

    if (!link) {
      console.warn(`Link not found for URL ${url} in scan ${scanId}`);
      return;
    }

    if (link.status !== 'PENDING') {
      console.log(`Link ${link.url} is already ${link.status}. Skipping job ${job.id}.`);
      return;
    }

    // Mark as PROCESSING to prevent race conditions during completion check
    await userDb.update(links).set({ status: 'PROCESSING' }).where(eq(links.id, link.id));

    const scanResult = await userDb.select().from(scans).where(eq(scans.id, scanId)).limit(1);
    const scan = scanResult[0];
    if (!scan || scan.status !== 'RUNNING') {
      console.log(`Scan ${scanId} is not running. Skipping job.`);
      return;
    }

    const newLinks = await processLink(userDb, link, scan, config);

    if (newLinks && newLinks.length > 0) {
      console.log(`Found ${newLinks.length} new links for scan ${scanId}. Enqueuing...`);
      const targetUrls = config.targetUrls || [];
      const isTargeted = !!config.isTargeted && targetUrls.length > 0;
      
      const jobs = newLinks.map(l => {
        const isTarget = isTargeted && targetUrls.some((target: string) => isTargetUrlMatch(l.url, target));
        return {
          name: `scan-link-${l.id}`,
          data: {
            userId,
            scanId,
            url: l.url,
            depth: l.depth,
            config,
            linkId: l.id
          },
          opts: {
            priority: isTarget ? 1 : 10
          }
        };
      });

      await scanQueue.addBulk(jobs);
    }

    // Scan-specific completion check:
    // A scan is complete if there are no PENDING or PROCESSING links left in the database.
    const activeLinksCount = await userDb.select({ id: links.id })
      .from(links)
      .where(and(
        eq(links.scanId, scanId), 
        or(eq(links.status, 'PENDING'), eq(links.status, 'PROCESSING'))
      ))
      .limit(1);

    if (activeLinksCount.length === 0) {
      console.log(`Scan ${scanId} completed (No PENDING or PROCESSING links left).`);
      await userDb.update(scans).set({ status: 'COMPLETED', updatedAt: new Date() }).where(eq(scans.id, scanId));
    } else {
      // Fallback: If the DB thinks there are active links but the BullMQ queue is empty, 
      // it means those links are orphans (missed enqueuing due to race conditions or crashes).
      const counts = await scanQueue.getJobCounts('waiting', 'active');
      
      // If no one is waiting and we are the only active one (or no one is active), we are done or stuck.
      if (counts.waiting === 0 && counts.active <= 1) {
        const orphans = await userDb.select().from(links).where(and(eq(links.scanId, scanId), eq(links.status, 'PENDING')));
        
        if (orphans.length > 0) {
          console.log(`Scan ${scanId} has ${orphans.length} orphaned PENDING links. Re-enqueuing...`);
          const scanConfig = typeof scan.config === 'string' ? JSON.parse(scan.config) : scan.config;
          const orphanTargets = scanConfig.targetUrls || [];
          const orphanTargeted = !!scanConfig.isTargeted && orphanTargets.length > 0;
          const jobs = orphans.map(l => {
            const isTarget = orphanTargeted && orphanTargets.some((target: string) => isTargetUrlMatch(l.url, target));
            return {
              name: `scan-link-${l.id}`,
              data: { userId, scanId, url: l.url, depth: l.depth, config: scanConfig, linkId: l.id },
              opts: { jobId: `scan-link-${l.id}`, priority: isTarget ? 1 : 10 }
            };
          });
          await scanQueue.addBulk(jobs);
        } else {
          console.log(`Scan ${scanId} has stuck PROCESSING links but queue is empty. Marking as COMPLETED.`);
          await userDb.update(scans).set({ status: 'COMPLETED', updatedAt: new Date() }).where(eq(scans.id, scanId));
        }
      }
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
