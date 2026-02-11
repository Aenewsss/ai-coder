import { Worker } from 'bullmq';
import { redisConnection, JobData, JobResult } from './queue.js';
import { processJob } from './processor.js';
import { logger } from '../utils/logger.js';

// Import env to trigger validation
import '../config/env.js';

const log = logger.child({ component: 'worker' });

const worker = new Worker<JobData, JobResult>(
  'ai-coder-jobs',
  processJob,
  {
    connection: redisConnection,
    concurrency: 1, // Process one job at a time
    limiter: {
      max: 10,
      duration: 60000, // Max 10 jobs per minute
    },
  }
);

worker.on('ready', () => {
  log.info('Worker is ready and waiting for jobs');
});

worker.on('active', (job) => {
  log.info({ jobId: job.id, task: job.data.task.description.slice(0, 50) }, 'Job started');
});

worker.on('completed', (job, result) => {
  log.info(
    { jobId: job.id, success: result.success, prUrl: result.pullRequestUrl },
    'Job completed'
  );
});

worker.on('failed', (job, error) => {
  log.error(
    { jobId: job?.id, error: error.message, attempts: job?.attemptsMade },
    'Job failed'
  );
});

worker.on('error', (error) => {
  log.error({ error: error.message }, 'Worker error');
});

// Graceful shutdown
async function shutdown(signal: string) {
  log.info({ signal }, 'Received shutdown signal');

  await worker.close();
  await redisConnection.quit();

  log.info('Worker shut down gracefully');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

log.info('Worker process started');
