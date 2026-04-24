import { scanQueue } from '../lib/bullmq';

async function checkQueue() {
  const counts = await scanQueue.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed', 'paused');
  console.log('Queue Job Counts:', JSON.stringify(counts, null, 2));

  const activeJobs = await scanQueue.getJobs(['active']);
  console.log(`Active Jobs: ${activeJobs.length}`);
  activeJobs.slice(0, 5).forEach(j => {
    console.log(` - [${j.id}] ${j.data.url}`);
  });

  const waitingJobs = await scanQueue.getJobs(['waiting']);
  console.log(`Waiting Jobs: ${waitingJobs.length}`);
  waitingJobs.slice(0, 5).forEach(j => {
    console.log(` - [${j.id}] ${j.data.url}`);
  });
  
  process.exit(0);
}

checkQueue().catch(console.error);
