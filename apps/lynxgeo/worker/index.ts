import { existsSync, writeSync } from 'fs';
import os from 'os';
import path from 'path';
import { Worker } from 'bullmq';
import dotenv from 'dotenv';
import { postgresTarget } from '../lib/db';
import { GEO_QUEUE, connection, redisTarget, type GeoJobData } from '../lib/geo/queue';
import { runAudit } from '../lib/geo/run-audit';

dotenv.config({ path: path.join(process.cwd(), '../../.env'), quiet: true });
dotenv.config({ quiet: true });

function enableUnbufferedStdio() {
  for (const stream of [process.stdout, process.stderr]) {
    const handle = (stream as NodeJS.WriteStream & { _handle?: { setBlocking?: (v: boolean) => void } })._handle;
    if (handle?.setBlocking) {
      try {
        handle.setBlocking(true);
      } catch {
        // writeSync below still flushes each line into docker logs
      }
    }
  }
}

function log(message: string) {
  writeSync(1, `${message}\n`);
}

function logErr(message: string, err?: unknown) {
  const extra = err instanceof Error ? `\n${err.stack || err.message}` : err ? `\n${String(err)}` : '';
  writeSync(2, `${message}${extra}\n`);
}

enableUnbufferedStdio();

const concurrency = parseInt(process.env.BULLMQ_CONCURRENCY || '2', 10);
const inDocker = existsSync('/.dockerenv');
const identity = `geo-${inDocker ? 'docker' : 'host'}-${os.hostname()}-${process.pid}`;
const consumerClientName = `bull:${Buffer.from(GEO_QUEUE).toString('base64')}`;

async function countBlockingConsumers(): Promise<number> {
  const raw = await connection.client('LIST');
  return String(raw)
    .split('\n')
    .filter((line) => line.includes(`name=${consumerClientName}`) && /cmd=bzpopmin/.test(line)).length;
}

async function warnIfOtherConsumers() {
  try {
    const n = await countBlockingConsumers();
    if (n > 0) {
      log(
        `[geo-worker] warning: ${n} other consumer(s) already on ${GEO_QUEUE} (${redisTarget()}). Listening anyway.`,
      );
    }
  } catch (err) {
    logErr('[geo-worker] could not list other redis consumers', err);
  }
}

async function main() {
  log(
    `[geo-worker] starting id=${identity} queue=${GEO_QUEUE} redis=${redisTarget()} postgres=${postgresTarget()} concurrency=${concurrency}`,
  );

  connection.on('error', (err) => {
    logErr(`[geo-worker] redis error: ${err.message}`, err);
  });
  connection.on('close', () => {
    logErr('[geo-worker] redis connection closed');
  });

  try {
    await connection.ping();
    log(`[geo-worker] redis ping ok (${redisTarget()})`);
  } catch (err) {
    logErr('[geo-worker] redis ping failed — worker cannot process jobs until Redis is reachable', err);
    process.exit(1);
  }

  await warnIfOtherConsumers();

  const worker = new Worker<GeoJobData>(
    GEO_QUEUE,
    async (job) => {
      const { userId, auditId } = job.data || ({} as GeoJobData);
      log(`[geo-worker] job ${job.id} start auditId=${auditId} userId=${userId} worker=${identity}`);
      if (!auditId || !userId) {
        throw new Error(`Job ${job.id} missing auditId or userId`);
      }
      const outcome = await runAudit(
        userId,
        auditId,
        (line) => log(`[geo-worker] job ${job.id} ${line}`),
        (data) => job.updateProgress(data),
      );
      log(`[geo-worker] job ${job.id} outcome=${outcome} auditId=${auditId}`);
    },
    {
      connection,
      concurrency,
      name: identity,
    },
  );

  worker.on('ready', () => {
    log(`[geo-worker] ready — listening on ${GEO_QUEUE} as ${identity}`);
  });

  worker.on('active', (job) => {
    log(`[geo-worker] job ${job.id} active auditId=${job.data?.auditId} worker=${identity}`);
  });

  worker.on('completed', (job) => {
    log(`[geo-worker] job ${job.id} completed auditId=${job.data?.auditId}`);
  });

  worker.on('failed', (job, err) => {
    logErr(`[geo-worker] job ${job?.id} failed auditId=${job?.data?.auditId}: ${err.message}`, err);
  });

  worker.on('error', (err) => {
    logErr(`[geo-worker] worker error: ${err.message}`, err);
  });

  worker.on('stalled', (jobId) => {
    logErr(`[geo-worker] job ${jobId} stalled`);
  });

  process.on('SIGTERM', async () => {
    log('[geo-worker] SIGTERM — shutting down');
    await worker.close();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    log('[geo-worker] SIGINT — shutting down');
    await worker.close();
    process.exit(0);
  });
}

main().catch((err) => {
  logErr('[geo-worker] failed to start', err);
  process.exit(1);
});
