import { Worker, Job, Queue } from 'bullmq';
import { connection, QUEUE_NAME, GEO_QUEUE_NAME, ScanJobData, scanQueue } from '../lib/bullmq';
import { processScanJob, createScanCompletionQueue } from '../lib/crawler/scan-job';
import { finalizeIdleRunningScans } from '../lib/crawler/scan-completion';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import express from 'express';

console.log('Starting BullMQ Worker...');

const enableBullBoard =
  process.env.ENABLE_BULL_BOARD === 'true' ||
  (process.env.ENABLE_BULL_BOARD !== 'false' && process.env.NODE_ENV !== 'production');

if (enableBullBoard) {
  // --- BullBoard Setup with Express (local/dev only by default) ---
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

  const boardPort = Number.parseInt(process.env.BULL_BOARD_PORT || '3001', 10);
  const boardHost = process.env.BULL_BOARD_HOST || '0.0.0.0';
  app.listen(boardPort, boardHost, () => {
    console.log(
      `BullBoard UI running at http://${boardHost}:${boardPort}/admin/queues (queues: ${QUEUE_NAME}, ${GEO_QUEUE_NAME})`,
    );
  });
} else {
  console.log('BullBoard disabled (set ENABLE_BULL_BOARD=true to enable).');
}

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
