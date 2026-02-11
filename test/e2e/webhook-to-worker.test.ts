import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import { FastifyInstance } from 'fastify';
import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  setupTestRedis,
  cleanupTestJobs,
  createdJobIds,
  waitForJobCompletion,
  MockCallbackServer,
} from './setup.js';
import { createWebhookPayload, JobStates } from './helpers.js';

// Import app components
import { createServer } from '../../src/api/server.js';
import { processJob } from '../../src/jobs/processor.js';
import { JobData, JobResult } from '../../src/jobs/queue.js';

describe('E2E: Webhook to Worker Flow', () => {
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
        // Simulate agent loop with progress updates
        const maxTurns = 5;
        for (let turn = 1; turn <= maxTurns; turn++) {
          await new Promise(resolve => setTimeout(resolve, 100));
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
    // Cleanup
    await worker.close();
    await queue.close();
    await redis.quit();
    await app.close();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupTestJobs();
  });

  it('should accept webhook, queue job, process it, and complete successfully', async () => {
    // Step 1: Send webhook request
    const payload = createWebhookPayload({
      task: {
        description: 'Add a new feature to the application',
        priority: 'normal',
      },
    });

    const response = await request
      .post('/webhook')
      .send(payload)
      .expect(202);

    // Verify webhook response
    expect(response.body).toMatchObject({
      status: 'queued',
      jobId: expect.any(String),
      statusUrl: expect.stringContaining('/jobs/'),
    });

    const jobId = response.body.jobId;
    createdJobIds.add(jobId);

    // Step 2: Verify job is in queue
    const job = await queue.getJob(jobId);
    expect(job).toBeDefined();
    expect(job!.data).toMatchObject(payload);

    // Step 3: Wait for job to be picked up by worker
    await new Promise(resolve => setTimeout(resolve, 200));

    const activeState = await job!.getState();
    expect(activeState).toBe(JobStates.ACTIVE);

    // Step 4: Wait for job completion
    const result = await waitForJobCompletion(queue, jobId, 30000);

    // Step 5: Verify job completed successfully
    expect(result.status).toBe('completed');
    expect(result.result).toMatchObject({
      success: true,
      message: expect.any(String),
      pullRequestUrl: expect.stringContaining('github.com'),
    });

    // Step 6: Verify job status via API
    const statusResponse = await request
      .get(`/jobs/${jobId}`)
      .expect(200);

    expect(statusResponse.body).toMatchObject({
      jobId,
      status: 'completed',
      result: {
        success: true,
        pullRequestUrl: expect.stringContaining('github.com'),
      },
    });
  }, 60000);

  it('should handle invalid webhook payloads', async () => {
    const invalidPayload = {
      task: {
        description: '', // Empty description should fail validation
        priority: 'normal',
      },
      organization: {
        id: 'test-org',
        name: 'Test Org',
        installationId: 12345,
      },
      repository: {
        owner: 'test',
        name: 'test',
        defaultBranch: 'main',
      },
    };

    const response = await request
      .post('/webhook')
      .send(invalidPayload)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Validation failed');
  });

  it('should respect job priority in queue', async () => {
    // Send low priority job
    const lowPriorityPayload = createWebhookPayload({
      task: { description: 'Low priority task', priority: 'low' },
    });

    const lowPriorityResponse = await request
      .post('/webhook')
      .send(lowPriorityPayload)
      .expect(202);

    createdJobIds.add(lowPriorityResponse.body.jobId);

    // Send high priority job
    const highPriorityPayload = createWebhookPayload({
      task: { description: 'High priority task', priority: 'high' },
    });

    const highPriorityResponse = await request
      .post('/webhook')
      .send(highPriorityPayload)
      .expect(202);

    createdJobIds.add(highPriorityResponse.body.jobId);

    // Wait for jobs to be queued
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify both jobs are in queue
    const waitingJobs = await queue.getWaiting();
    expect(waitingJobs.length).toBeGreaterThanOrEqual(2);

    // The high priority job should have lower priority number (processed first)
    const highPriorityJob = await queue.getJob(highPriorityResponse.body.jobId);
    const lowPriorityJob = await queue.getJob(lowPriorityResponse.body.jobId);

    expect(highPriorityJob!.opts.priority).toBeLessThan(lowPriorityJob!.opts.priority!);
  });

  it('should handle job failures gracefully', async () => {
    // Mock agent to fail
    const { runAgentLoop } = await import('../../src/agent/loop.js');
    vi.mocked(runAgentLoop).mockRejectedValueOnce(new Error('Agent failed'));

    const payload = createWebhookPayload({
      task: { description: 'Task that will fail', priority: 'normal' },
    });

    const response = await request
      .post('/webhook')
      .send(payload)
      .expect(202);

    const jobId = response.body.jobId;
    createdJobIds.add(jobId);

    // Wait for job to fail
    const result = await waitForJobCompletion(queue, jobId, 30000);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Agent failed');

    // Verify via API
    const statusResponse = await request
      .get(`/jobs/${jobId}`)
      .expect(200);

    expect(statusResponse.body.status).toBe('failed');
  }, 60000);

  it('should create job with correct metadata', async () => {
    const payload = createWebhookPayload({
      task: {
        description: 'Test metadata task',
        priority: 'high',
      },
      organization: {
        id: 'org-456',
        name: 'Test Org Name',
        installationId: 99999,
      },
      repository: {
        owner: 'test-owner',
        name: 'test-repo',
        defaultBranch: 'develop',
      },
    });

    const response = await request
      .post('/webhook')
      .send(payload)
      .expect(202);

    const jobId = response.body.jobId;
    createdJobIds.add(jobId);

    const job = await queue.getJob(jobId);
    expect(job).toBeDefined();

    // Verify all metadata is preserved
    expect(job!.data).toEqual(payload);
    expect(job!.data.task.description).toBe('Test metadata task');
    expect(job!.data.organization.installationId).toBe(99999);
    expect(job!.data.repository.defaultBranch).toBe('develop');
  });
});
