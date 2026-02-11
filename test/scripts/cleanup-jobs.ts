import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { JobData, JobResult } from '../../src/jobs/queue.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

async function cleanupJobs() {
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  const queue = new Queue<JobData, JobResult>('ai-coder-jobs', {
    connection: redis,
  });

  console.log(`${colors.bright}${colors.yellow}Cleaning up jobs...${colors.reset}\n`);

  // Get counts before cleanup
  const completedBefore = await queue.getCompletedCount();
  const failedBefore = await queue.getFailedCount();

  console.log(`Jobs before cleanup:`);
  console.log(`  Completed: ${completedBefore}`);
  console.log(`  Failed: ${failedBefore}`);
  console.log('');

  // Clean completed jobs
  await queue.clean(0, 100, 'completed');
  console.log(`${colors.green}✓ Cleaned completed jobs${colors.reset}`);

  // Clean failed jobs
  await queue.clean(0, 100, 'failed');
  console.log(`${colors.green}✓ Cleaned failed jobs${colors.reset}`);

  // Get counts after cleanup
  const completedAfter = await queue.getCompletedCount();
  const failedAfter = await queue.getFailedCount();

  console.log('');
  console.log(`Jobs after cleanup:`);
  console.log(`  Completed: ${completedAfter}`);
  console.log(`  Failed: ${failedAfter}`);
  console.log('');

  console.log(`${colors.green}Cleanup complete!${colors.reset}`);
  console.log(`  Removed ${completedBefore - completedAfter} completed jobs`);
  console.log(`  Removed ${failedBefore - failedAfter} failed jobs`);

  await queue.close();
  await redis.quit();
}

cleanupJobs().catch(console.error);
