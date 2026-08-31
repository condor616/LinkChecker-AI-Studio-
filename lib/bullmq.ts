import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

/** LynxScan link-crawl jobs. */
export const QUEUE_NAME = 'scan-jobs';

/**
 * Lynx GEO (AI Audit) queue on the same Redis. Separate name so Scan and GEO
 * jobs never share a worker. Bull Board instantiates this by name only —
 * do not import apps/lynxgeo from the LynxScan worker.
 */
export const GEO_QUEUE_NAME = 'lynxgeo-jobs';

export const scanQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export interface ScanJobData {
  userId: string;
  scanId: string;
  url: string;
  depth: number;
  config: any;
  linkId?: string; // Optional: if we already have the link record
}
