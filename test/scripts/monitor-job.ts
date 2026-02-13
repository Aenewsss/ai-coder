import 'dotenv/config';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { JobData, JobResult, JobProgress } from '../../src/jobs/queue.js';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

interface JobStatusResponse {
  status: 'queued' | 'active' | 'completed' | 'failed' | 'unknown';
  result?: JobResult;
  progress?: JobProgress;
}

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function formatProgress(progress?: JobProgress): string {
  if (!progress) return 'N/A';

  const bar = '='.repeat(Math.floor(progress.percentage / 5));
  const empty = ' '.repeat(20 - bar.length);
  const turnInfo = progress.turn !== undefined && progress.maxTurns !== undefined
    ? ` (Turn ${progress.turn}/${progress.maxTurns})`
    : '';

  return `[${bar}${empty}] ${progress.percentage}%${turnInfo}`;
}

function formatStatus(status: string): string {
  switch (status) {
    case 'queued':
      return `${colors.yellow}⏳ QUEUED${colors.reset}`;
    case 'active':
      return `${colors.blue}⚙️  ACTIVE${colors.reset}`;
    case 'completed':
      return `${colors.green}✓ COMPLETED${colors.reset}`;
    case 'failed':
      return `${colors.red}✗ FAILED${colors.reset}`;
    default:
      return `${colors.reset}? UNKNOWN${colors.reset}`;
  }
}

async function monitorJobViaAPI(jobId: string): Promise<void> {
  console.log(`${colors.bright}${colors.blue}Monitoring job via API: ${jobId}${colors.reset}\n`);

  let previousStatus = '';
  let completed = false;

  while (!completed) {
    try {
      const response = await fetch(`${API_URL}/jobs/${jobId}`);
      const data: JobStatusResponse = await response.json();

      const statusStr = JSON.stringify(data);

      if (statusStr !== previousStatus) {
        console.clear();
        console.log(`${colors.bright}${colors.blue}Job Monitor - ${new Date().toLocaleTimeString()}${colors.reset}`);
        console.log(`Job ID: ${colors.cyan}${jobId}${colors.reset}\n`);

        console.log(`Status: ${formatStatus(data.status)}`);

        if (data.progress) {
          console.log(`Progress: ${formatProgress(data.progress)}`);
        }

        if (data.result) {
          console.log(`\n${colors.bright}Result:${colors.reset}`);
          console.log(`  Success: ${data.result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`);
          console.log(`  Message: ${data.result.message}`);

          if (data.result.pullRequestUrl) {
            console.log(`  PR URL: ${colors.cyan}${data.result.pullRequestUrl}${colors.reset}`);
          }

          if (data.result.error) {
            console.log(`  Error: ${colors.red}${data.result.error}${colors.reset}`);
          }
        }

        previousStatus = statusStr;
      }

      if (data.status === 'completed' || data.status === 'failed') {
        completed = true;
        console.log(`\n${colors.green}Monitoring complete.${colors.reset}`);
      } else {
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`${colors.red}Error fetching job status:${colors.reset}`, error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

async function monitorJobViaRedis(jobId: string): Promise<void> {
  console.log(`${colors.bright}${colors.blue}Monitoring job via Redis: ${jobId}${colors.reset}\n`);

  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  const queue = new Queue<JobData, JobResult>('ai-coder-jobs', {
    connection: redis,
  });

  const queueEvents = new QueueEvents('ai-coder-jobs', {
    connection: redis.duplicate(),
  });

  let completed = false;

  const displayJobInfo = async () => {
    const job = await queue.getJob(jobId);

    if (!job) {
      console.log(`${colors.red}Job not found${colors.reset}`);
      return;
    }

    const state = await job.getState();

    console.clear();
    console.log(`${colors.bright}${colors.blue}Job Monitor - ${new Date().toLocaleTimeString()}${colors.reset}`);
    console.log(`Job ID: ${colors.cyan}${jobId}${colors.reset}\n`);

    console.log(`Status: ${formatStatus(state)}`);
    console.log(`Attempts: ${job.attemptsMade}/${job.opts.attempts || 3}`);

    if (job.progress) {
      const progress = job.progress as JobProgress;
      console.log(`Progress: ${formatProgress(progress)}`);
    }

    if (job.returnvalue) {
      const result = job.returnvalue as JobResult;
      console.log(`\n${colors.bright}Result:${colors.reset}`);
      console.log(`  Success: ${result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`);
      console.log(`  Message: ${result.message}`);

      if (result.pullRequestUrl) {
        console.log(`  PR URL: ${colors.cyan}${result.pullRequestUrl}${colors.reset}`);
      }

      if (result.error) {
        console.log(`  Error: ${colors.red}${result.error}${colors.reset}`);
      }
    }

    if (job.failedReason) {
      console.log(`\n${colors.red}Failed Reason: ${job.failedReason}${colors.reset}`);
    }
  };

  // Initial display
  await displayJobInfo();

  // Listen to events
  queueEvents.on('progress', async ({ jobId: eventJobId, data }) => {
    if (eventJobId === jobId) {
      await displayJobInfo();
    }
  });

  queueEvents.on('completed', async ({ jobId: eventJobId }) => {
    if (eventJobId === jobId) {
      await displayJobInfo();
      console.log(`\n${colors.green}Job completed!${colors.reset}`);
      completed = true;
    }
  });

  queueEvents.on('failed', async ({ jobId: eventJobId }) => {
    if (eventJobId === jobId) {
      await displayJobInfo();
      console.log(`\n${colors.red}Job failed!${colors.reset}`);
      completed = true;
    }
  });

  // Wait for completion
  while (!completed) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  await queue.close();
  await queueEvents.close();
  await redis.quit();
}

// Main
const jobId = process.argv[2];
const mode = process.argv[3] || 'api'; // 'api' or 'redis'

if (!jobId) {
  console.log(`${colors.red}Usage: tsx test/scripts/monitor-job.ts <jobId> [mode]${colors.reset}`);
  console.log(`  mode: 'api' (default) or 'redis'`);
  console.log(`\nExample:`);
  console.log(`  tsx test/scripts/monitor-job.ts abc123`);
  console.log(`  tsx test/scripts/monitor-job.ts abc123 redis`);
  process.exit(1);
}

if (mode === 'redis') {
  monitorJobViaRedis(jobId).catch(console.error);
} else {
  monitorJobViaAPI(jobId).catch(console.error);
}
