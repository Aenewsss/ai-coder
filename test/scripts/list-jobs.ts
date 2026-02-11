import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { JobData, JobResult } from '../../src/jobs/queue.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

async function listJobs() {
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  const queue = new Queue<JobData, JobResult>('ai-coder-jobs', {
    connection: redis,
  });

  console.log(`${colors.bright}${colors.blue}=== AI Coder Jobs ===${colors.reset}\n`);

  // Get jobs in different states
  const waiting = await queue.getWaiting();
  const active = await queue.getActive();
  const completed = await queue.getCompleted();
  const failed = await queue.getFailed();

  const displayJobs = (title: string, jobs: any[], color: string) => {
    if (jobs.length === 0) return;

    console.log(`${colors.bright}${color}${title} (${jobs.length}):${colors.reset}`);

    jobs.forEach((job) => {
      const data = job.data as JobData;
      const taskPreview = data.task.description.slice(0, 60);
      const repo = `${data.repository.owner}/${data.repository.name}`;

      console.log(`  ${colors.cyan}${job.id}${colors.reset} - ${taskPreview}${data.task.description.length > 60 ? '...' : ''}`);
      console.log(`    ${colors.gray}Repo: ${repo} | Priority: ${data.task.priority}${colors.reset}`);

      if (job.progress) {
        const progress = job.progress as any;
        console.log(`    ${colors.gray}Progress: ${progress.percentage}%${colors.reset}`);
      }

      if (job.returnvalue) {
        const result = job.returnvalue as JobResult;
        const statusIcon = result.success ? '✓' : '✗';
        const statusColor = result.success ? colors.green : colors.red;
        console.log(`    ${statusColor}${statusIcon} ${result.message}${colors.reset}`);

        if (result.pullRequestUrl) {
          console.log(`    ${colors.blue}PR: ${result.pullRequestUrl}${colors.reset}`);
        }
      }

      if (job.failedReason) {
        console.log(`    ${colors.red}Error: ${job.failedReason}${colors.reset}`);
      }

      console.log('');
    });
  };

  displayJobs('Waiting Jobs', waiting, colors.yellow);
  displayJobs('Active Jobs', active, colors.blue);
  displayJobs('Completed Jobs', completed.slice(0, 10), colors.green);
  displayJobs('Failed Jobs', failed.slice(0, 10), colors.red);

  // Summary
  console.log(`${colors.bright}Summary:${colors.reset}`);
  console.log(`  Waiting: ${colors.yellow}${waiting.length}${colors.reset}`);
  console.log(`  Active: ${colors.blue}${active.length}${colors.reset}`);
  console.log(`  Completed: ${colors.green}${completed.length}${colors.reset}`);
  console.log(`  Failed: ${colors.red}${failed.length}${colors.reset}`);

  await queue.close();
  await redis.quit();
}

listJobs().catch(console.error);
