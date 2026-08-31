import { Worker, Job, Queue } from 'bullmq';
import { connection, QUEUE_NAME, GEO_QUEUE_NAME, ScanJobData, scanQueue } from '../lib/bullmq';
import { processScanJob, createScanCompletionQueue } from '../lib/crawler/scan-job';
import { finalizeIdleRunningScans } from '../lib/crawler/scan-completion';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import express from 'express';

console.log('Starting BullMQ Worker...');

// --- BullBoard Setup with Express ---
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

// Observe GEO's queue by name on the shared Redis — do not import GEO internals.
const geoQueueForBoard = new Queue(GEO_QUEUE_NAME, { connection });

createBullBoard({
  queues: [new BullMQAdapter(scanQueue), new BullMQAdapter(geoQueueForBoard)],
  serverAdapter,
});

const app = express();
app.use('/admin/queues', serverAdapter.getRouter());

const boardPort = 3001;
app.listen(boardPort, () => {
  console.log(
    `BullBoard UI running at http://localhost:${boardPort}/admin/queues (queues: ${QUEUE_NAME}, ${GEO_QUEUE_NAME})`,
  );
});

let idleSweepInFlight = false;
let sweepAgain = false;

async function sweepIdleRunningScans(reason: string) {
  if (idleSweepInFlight) {
    sweepAgain = true;
    return;
  }
  idleSweepInFlight = true;
  try {
    do {
      sweepAgain = false;
      const completed = await finalizeIdleRunningScans(createScanCompletionQueue);
      if (completed > 0) {
        console.log(`Idle sweep (${reason}) marked ${completed} scan(s) COMPLETED.`);
      }
    } while (sweepAgain);
  } catch (err: any) {
    console.error(`Idle sweep (${reason}) failed:`, err?.message || err);
  } finally {
    idleSweepInFlight = false;
    if (sweepAgain) {
      void sweepIdleRunningScans(reason);
    }
  }
}

// --- Worker Logic ---
const worker = new Worker<ScanJobData>(
  QUEUE_NAME,
  async (job: Job<ScanJobData>) => {
    await processScanJob(job);
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

worker.on('drained', () => {
  void sweepIdleRunningScans('queue drained');
});

void sweepIdleRunningScans('startup');

const idleSweepMs = parseInt(process.env.SCAN_IDLE_SWEEP_MS || '30000', 10);
if (idleSweepMs > 0) {
  setInterval(() => {
    void sweepIdleRunningScans('interval');
  }, idleSweepMs);
}

process.on('SIGTERM', async () => {
  console.log('Worker shutting down...');
  await worker.close();
  process.exit(0);
});
