import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

export interface TaskPayload {
  description: string;
  priority: 'low' | 'normal' | 'high';
}

export interface OrganizationPayload {
  id: string;
  name: string;
  installationId: number;
}

export interface RepositoryPayload {
  owner: string;
  name: string;
  defaultBranch: string;
}

export interface CallbackPayload {
  url: string;
}

export interface JobData {
  task: TaskPayload;
  organization: OrganizationPayload;
  repository: RepositoryPayload;
  callback?: CallbackPayload;
}

export interface JobResult {
  success: boolean;
  message: string;
  pullRequestUrl?: string;
  error?: string;
}

// Shared Redis connection
export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Job queue
export const jobQueue = new Queue<JobData, JobResult>('ai-coder-jobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 60 * 60, // Keep completed jobs for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
    },
  },
});

// Queue events for monitoring
export const queueEvents = new QueueEvents('ai-coder-jobs', {
  connection: redisConnection,
});

export async function addJob(data: JobData): Promise<string> {
  const priority = data.task.priority === 'high' ? 1 : data.task.priority === 'low' ? 3 : 2;

  const job = await jobQueue.add('process-task', data, {
    priority,
  });

  return job.id!;
}

export interface JobProgress {
  percentage: number;
  turn?: number;
  maxTurns?: number;
}

export async function getJobStatus(jobId: string): Promise<{
  status: 'queued' | 'active' | 'completed' | 'failed' | 'unknown';
  result?: JobResult;
  progress?: JobProgress;
}> {
  const job = await jobQueue.getJob(jobId);

  if (!job) {
    return { status: 'unknown' };
  }

  const state = await job.getState();

  switch (state) {
    case 'waiting':
    case 'delayed':
    case 'waiting-children':
      return { status: 'queued' };
    case 'active':
      return { status: 'active', progress: job.progress as JobProgress };
    case 'completed':
      return { status: 'completed', result: job.returnvalue };
    case 'failed':
      return {
        status: 'failed',
        result: {
          success: false,
          message: job.failedReason || 'Job failed',
          error: job.failedReason,
        },
      };
    default:
      return { status: 'unknown' };
  }
}

export async function closeQueue(): Promise<void> {
  await jobQueue.close();
  await queueEvents.close();
  await redisConnection.quit();
}
