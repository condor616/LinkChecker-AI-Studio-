import dotenv from 'dotenv';
import path from 'path';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { nextGeoAuditJobId } from './frontier';

export { nextGeoAuditJobId };

dotenv.config({ path: path.join(process.cwd(), '../../.env'), quiet: true });
dotenv.config({ quiet: true });

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
export const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
/** Independent of LynxScan's `scan-jobs`. Same Redis, different BullMQ queue. */
export const GEO_QUEUE = 'lynxgeo-jobs';

/** Hostname:port only — never include passwords. */
export function redisTarget(url = redisUrl): string {
  try {
    const parsed = new URL(url);
    const port = parsed.port || (parsed.protocol === 'rediss:' ? '6380' : '6379');
    return `${parsed.protocol}//${parsed.hostname}:${port}`;
  } catch {
    return '(unparseable REDIS_URL)';
  }
}

export const geoQueue = new Queue(GEO_QUEUE, {
  connection,
  defaultJobOptions: { attempts: 2, removeOnComplete: true, removeOnFail: false },
});

export type GeoJobData = { userId: string; auditId: string };

export async function enqueueGeoAudit(userId: string, auditId: string) {
  return geoQueue.add('audit', { userId, auditId }, { jobId: nextGeoAuditJobId(auditId) });
}
