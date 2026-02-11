import { beforeAll, afterAll, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';

// Test Redis connection
export let testRedis: Redis;
export let testQueue: Queue;
export let testWorker: Worker;

// Keep track of all job IDs created during tests for cleanup
export const createdJobIds: Set<string> = new Set();

// Setup test Redis
export function setupTestRedis(): Redis {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
  });
  return redis;
}

// Cleanup helper
export async function cleanupTestJobs() {
  if (!testQueue) return;

  // Remove all jobs created during tests
  for (const jobId of createdJobIds) {
    try {
      const job = await testQueue.getJob(jobId);
      if (job) {
        await job.remove();
      }
    } catch (error) {
      // Job might already be removed
    }
  }

  createdJobIds.clear();
}

// Wait for job to complete or fail with timeout
export async function waitForJobCompletion(
  queue: Queue,
  jobId: string,
  timeoutMs: number = 60000
): Promise<{ status: string; result?: any; error?: string }> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const job = await queue.getJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const state = await job.getState();

    if (state === 'completed') {
      return {
        status: 'completed',
        result: job.returnvalue,
      };
    }

    if (state === 'failed') {
      return {
        status: 'failed',
        error: job.failedReason,
      };
    }

    // Wait a bit before checking again
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`);
}

// Get all progress updates for a job
export async function getJobProgressUpdates(
  queue: Queue,
  jobId: string,
  intervalMs: number = 100,
  maxDuration: number = 60000
): Promise<Array<{ percentage: number; turn?: number; maxTurns?: number }>> {
  const progressUpdates: Array<{ percentage: number; turn?: number; maxTurns?: number }> = [];
  const startTime = Date.now();

  while (Date.now() - startTime < maxDuration) {
    const job = await queue.getJob(jobId);

    if (!job) {
      break;
    }

    const state = await job.getState();
    const progress = job.progress as any;

    // Record progress if it has changed
    if (progress && typeof progress === 'object') {
      const lastProgress = progressUpdates[progressUpdates.length - 1];
      if (!lastProgress || lastProgress.percentage !== progress.percentage) {
        progressUpdates.push({ ...progress });
      }
    }

    // Stop if job is done
    if (state === 'completed' || state === 'failed') {
      break;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return progressUpdates;
}

// Mock callback server
export class MockCallbackServer {
  private callbacks: any[] = [];
  private port: number;
  private server: any;

  constructor(port: number = 3999) {
    this.port = port;
  }

  async start() {
    const Fastify = (await import('fastify')).default;
    this.server = Fastify({ logger: false });

    this.server.post('/callback', async (request: any) => {
      this.callbacks.push({
        timestamp: new Date().toISOString(),
        payload: request.body,
      });
      return { received: true };
    });

    this.server.get('/callbacks', async () => {
      return { callbacks: this.callbacks };
    });

    await this.server.listen({ port: this.port, host: '0.0.0.0' });
  }

  async stop() {
    if (this.server) {
      await this.server.close();
    }
  }

  getCallbacks() {
    return this.callbacks;
  }

  clearCallbacks() {
    this.callbacks = [];
  }

  getUrl() {
    return `http://localhost:${this.port}/callback`;
  }
}

// Mock workspace and agent for testing
export function mockAgentDependencies() {
  // This will be used to mock the actual GitHub and agent operations
  // so tests don't require real GitHub credentials
  return {
    mockWorkspace: vi.fn(),
    mockAgentLoop: vi.fn(),
  };
}
