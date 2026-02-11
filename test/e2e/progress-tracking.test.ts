import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import { FastifyInstance } from 'fastify';
import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  setupTestRedis,
  cleanupTestJobs,
  createdJobIds,
  getJobProgressUpdates,
} from './setup.js';
import { createWebhookPayload, validateProgressSequence } from './helpers.js';

// Import app components
import { createServer } from '../../src/api/server.js';
import { processJob } from '../../src/jobs/processor.js';
import { JobData, JobResult } from '../../src/jobs/queue.js';

describe('E2E: Progress Tracking from 0% to 100%', () => {
  let app: FastifyInstance;
  let redis: Redis;
  let queue: Queue<JobData, JobResult>;
  let worker: Worker<JobData, JobResult>;
  let request: supertest.SuperTest<supertest.Test>;

  beforeAll(async () => {
    // Setup Redis
    redis = setupTestRedis();

    // Setup queue
    queue = new Queue<JobData, JobResult>('ai-coder-jobs', {
      connection: redis,
    });

    // Build app
    app = await createServer();
    await app.ready();

    // Setup supertest
    request = supertest(app.server);

    // Mock the agent and workspace functions
    vi.mock('../../src/sandbox/workspace.js', () => ({
      createWorkspace: vi.fn().mockResolvedValue({
        path: '/tmp/test-workspace',
        repoPath: '/tmp/test-workspace/repo',
        cleanup: vi.fn(),
      }),
      cleanupJobWorkspaces: vi.fn().mockResolvedValue(undefined),
    }));

    vi.mock('../../src/agent/loop.js', () => ({
      runAgentLoop: vi.fn().mockImplementation(async (_workspace, _task, _jobId, progressCallback) => {
        // Simulate agent loop with multiple turns to test progress tracking
        const maxTurns = 10;
        for (let turn = 1; turn <= maxTurns; turn++) {
          await new Promise(resolve => setTimeout(resolve, 50));
          progressCallback(turn, maxTurns);
        }

        return {
          success: true,
          summary: 'Task completed successfully',
          pullRequestUrl: 'https://github.com/test-owner/test-repo/pull/123',
        };
      }),
    }));

    // Start worker
    worker = new Worker<JobData, JobResult>(
      'ai-coder-jobs',
      processJob,
      {
        connection: redis,
        concurrency: 1,
      }
    );

    // Wait for worker to be ready
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    await worker.close();
    await queue.close();
    await redis.quit();
    await app.close();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupTestJobs();
  });

  it('should track progress from webhook to 100% completion', async () => {
    // Send webhook
    const payload = createWebhookPayload({
      task: {
        description: 'Task to track progress',
        priority: 'normal',
      },
    });

    const response = await request
      .post('/webhook')
      .send(payload)
      .expect(202);

    const jobId = response.body.jobId;
    createdJobIds.add(jobId);

    // Start tracking progress in parallel
    const progressPromise = getJobProgressUpdates(queue, jobId, 50, 30000);

    // Wait for job to complete
    await new Promise(resolve => {
      const checkInterval = setInterval(async () => {
        const job = await queue.getJob(jobId);
        if (job) {
          const state = await job.getState();
          if (state === 'completed' || state === 'failed') {
            clearInterval(checkInterval);
            resolve(undefined);
          }
        }
      }, 100);
    });

    // Get collected progress updates
    const progressUpdates = await progressPromise;

    // Verify we got progress updates
    expect(progressUpdates.length).toBeGreaterThan(0);

    // Validate progress sequence
    const validation = validateProgressSequence(progressUpdates);
    expect(validation.valid).toBe(true);

    if (!validation.valid) {
      console.error('Progress validation errors:', validation.errors);
    }

    // Verify specific milestones
    const percentages = progressUpdates.map(p => p.percentage);

    // Should have 10% (workspace created)
    expect(percentages).toContain(10);

    // Should have 20% (agent loop starting)
    expect(percentages).toContain(20);

    // Should have progress between 20-90% (agent loop running)
    const agentLoopProgress = percentages.filter(p => p > 20 && p < 90);
    expect(agentLoopProgress.length).toBeGreaterThan(0);

    // Should have 90% (before final completion)
    expect(percentages).toContain(90);

    // Should reach 100% (completion)
    expect(percentages).toContain(100);
  }, 60000);

  it('should include turn information in progress during agent loop', async () => {
    const payload = createWebhookPayload({
      task: {
        description: 'Task to track turn information',
        priority: 'normal',
      },
    });

    const response = await request
      .post('/webhook')
      .send(payload)
      .expect(202);

    const jobId = response.body.jobId;
    createdJobIds.add(jobId);

    // Get progress updates
    const progressUpdates = await getJobProgressUpdates(queue, jobId, 50, 30000);

    // Filter updates during agent loop (20-90%)
    const agentLoopUpdates = progressUpdates.filter(
      p => p.percentage > 20 && p.percentage < 90
    );

    expect(agentLoopUpdates.length).toBeGreaterThan(0);

    // Verify turn information is present
    agentLoopUpdates.forEach(update => {
      expect(update.turn).toBeDefined();
      expect(update.maxTurns).toBeDefined();
      expect(update.turn).toBeGreaterThan(0);
      expect(update.turn).toBeLessThanOrEqual(update.maxTurns!);
    });

    // Verify turns are incrementing
    const turns = agentLoopUpdates
      .filter(u => u.turn !== undefined)
      .map(u => u.turn!);

    for (let i = 1; i < turns.length; i++) {
      expect(turns[i]).toBeGreaterThanOrEqual(turns[i - 1]);
    }
  }, 60000);

  it('should report progress via status endpoint', async () => {
    const payload = createWebhookPayload({
      task: {
        description: 'Task to check status endpoint',
        priority: 'normal',
      },
    });

    const webhookResponse = await request
      .post('/webhook')
      .send(payload)
      .expect(202);

    const jobId = webhookResponse.body.jobId;
    createdJobIds.add(jobId);

    // Poll status endpoint while job is active
    let progressSeen = false;
    let activeStatusSeen = false;

    for (let i = 0; i < 50; i++) {
      const statusResponse = await request
        .get(`/jobs/${jobId}`)
        .expect(200);

      if (statusResponse.body.status === 'active') {
        activeStatusSeen = true;

        if (statusResponse.body.progress) {
          progressSeen = true;
          expect(statusResponse.body.progress).toHaveProperty('percentage');
          expect(statusResponse.body.progress.percentage).toBeGreaterThanOrEqual(0);
          expect(statusResponse.body.progress.percentage).toBeLessThanOrEqual(100);
        }
      }

      if (statusResponse.body.status === 'completed' || statusResponse.body.status === 'failed') {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    expect(activeStatusSeen).toBe(true);
    expect(progressSeen).toBe(true);
  }, 60000);

  it('should show 100% progress when job completes', async () => {
    const payload = createWebhookPayload({
      task: {
        description: 'Task to verify 100% completion',
        priority: 'normal',
      },
    });

    const response = await request
      .post('/webhook')
      .send(payload)
      .expect(202);

    const jobId = response.body.jobId;
    createdJobIds.add(jobId);

    // Wait for completion
    let completed = false;
    while (!completed) {
      const job = await queue.getJob(jobId);
      const state = await job!.getState();
      if (state === 'completed' || state === 'failed') {
        completed = true;

        // Check final progress
        const progress = job!.progress as any;
        expect(progress).toBeDefined();
        expect(progress.percentage).toBe(100);
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }, 60000);

  it('should have monotonically increasing progress percentages', async () => {
    const payload = createWebhookPayload({
      task: {
        description: 'Task to verify monotonic progress',
        priority: 'normal',
      },
    });

    const response = await request
      .post('/webhook')
      .send(payload)
      .expect(202);

    const jobId = response.body.jobId;
    createdJobIds.add(jobId);

    const progressUpdates = await getJobProgressUpdates(queue, jobId, 50, 30000);

    // Verify monotonically increasing
    for (let i = 1; i < progressUpdates.length; i++) {
      expect(progressUpdates[i].percentage).toBeGreaterThanOrEqual(
        progressUpdates[i - 1].percentage
      );
    }

    // Verify no duplicates (unless at boundaries)
    const percentages = progressUpdates.map(p => p.percentage);
    const uniquePercentages = [...new Set(percentages)];

    // Should have at least 5 unique progress points
    expect(uniquePercentages.length).toBeGreaterThanOrEqual(5);
  }, 60000);
});
