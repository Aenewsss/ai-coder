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
import { createWebhookPayload, waitUntil } from './helpers.js';

// Import app components
import { createServer } from '../../src/api/server.js';
import { processJob } from '../../src/jobs/processor.js';
import { JobData, JobResult } from '../../src/jobs/queue.js';

describe('E2E: Callback Integration', () => {
  let app: FastifyInstance;
  let redis: Redis;
  let queue: Queue<JobData, JobResult>;
  let worker: Worker<JobData, JobResult>;
  let request: supertest.SuperTest<supertest.Test>;
  let callbackServer: MockCallbackServer;

  beforeAll(async () => {
    // Setup callback server
    callbackServer = new MockCallbackServer(3999);
    await callbackServer.start();

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
        // Simulate agent loop
        const maxTurns = 3;
        for (let turn = 1; turn <= maxTurns; turn++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          progressCallback(turn, maxTurns);
        }

        return {
          success: true,
          summary: 'Task completed successfully',
          pullRequestUrl: 'https://github.com/test-owner/test-repo/pull/456',
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
    await callbackServer.stop();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    callbackServer.clearCallbacks();
    await cleanupTestJobs();
  });

  it('should send callback when job completes successfully', async () => {
    // Send webhook with callback URL
    const payload = createWebhookPayload({
      task: {
        description: 'Task with successful callback',
        priority: 'normal',
      },
      callback: {
        url: callbackServer.getUrl(),
      },
    });

    const response = await request
      .post('/webhook')
      .send(payload)
      .expect(202);

    const jobId = response.body.jobId;
    createdJobIds.add(jobId);

    // Wait for job to complete
    await waitForJobCompletion(queue, jobId, 30000);

    // Wait for callback to be received
    await waitUntil(() => callbackServer.getCallbacks().length > 0, 5000);

    // Verify callback was received
    const callbacks = callbackServer.getCallbacks();
    expect(callbacks).toHaveLength(1);

    const callbackPayload = callbacks[0].payload;

    // Verify callback payload structure
    expect(callbackPayload).toMatchObject({
      jobId,
      status: 'completed',
      success: true,
      message: expect.any(String),
      pullRequestUrl: 'https://github.com/test-owner/test-repo/pull/456',
      completedAt: expect.any(String),
    });

    // Verify timestamp is valid
    expect(new Date(callbackPayload.completedAt).getTime()).toBeGreaterThan(0);
  }, 60000);

  it('should send callback when job fails', async () => {
    // Mock agent to fail
    const { runAgentLoop } = await import('../../src/agent/loop.js');
    vi.mocked(runAgentLoop).mockRejectedValueOnce(new Error('Simulated failure'));

    const payload = createWebhookPayload({
      task: {
        description: 'Task that will fail',
        priority: 'normal',
      },
      callback: {
        url: callbackServer.getUrl(),
      },
    });

    const response = await request
      .post('/webhook')
      .send(payload)
      .expect(202);

    const jobId = response.body.jobId;
    createdJobIds.add(jobId);

    // Wait for job to fail
    await waitForJobCompletion(queue, jobId, 30000);

    // Wait for callback
    await waitUntil(() => callbackServer.getCallbacks().length > 0, 5000);

    const callbacks = callbackServer.getCallbacks();
    expect(callbacks).toHaveLength(1);

    const callbackPayload = callbacks[0].payload;

    expect(callbackPayload).toMatchObject({
      jobId,
      status: 'failed',
      success: false,
      message: expect.any(String),
      error: expect.stringContaining('Simulated failure'),
      completedAt: expect.any(String),
    });

    // Should not have PR URL on failure
    expect(callbackPayload.pullRequestUrl).toBeUndefined();
  }, 60000);

  it('should not send callback when callback URL is not provided', async () => {
    const payload = createWebhookPayload({
      task: {
        description: 'Task without callback',
        priority: 'normal',
      },
      // No callback field
    });

    const response = await request
      .post('/webhook')
      .send(payload)
      .expect(202);

    const jobId = response.body.jobId;
    createdJobIds.add(jobId);

    // Wait for job to complete
    await waitForJobCompletion(queue, jobId, 30000);

    // Wait a bit to ensure no callback is sent
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify no callback was sent
    const callbacks = callbackServer.getCallbacks();
    expect(callbacks).toHaveLength(0);
  }, 60000);

  it('should handle callback server being unavailable gracefully', async () => {
    // Stop callback server
    await callbackServer.stop();

    const payload = createWebhookPayload({
      task: {
        description: 'Task with unavailable callback',
        priority: 'normal',
      },
      callback: {
        url: 'http://localhost:9999/callback', // Non-existent server
      },
    });

    const response = await request
      .post('/webhook')
      .send(payload)
      .expect(202);

    const jobId = response.body.jobId;
    createdJobIds.add(jobId);

    // Job should still complete even if callback fails
    const result = await waitForJobCompletion(queue, jobId, 30000);

    expect(result.status).toBe('completed');
    expect(result.result.success).toBe(true);

    // Restart callback server for other tests
    callbackServer = new MockCallbackServer(3999);
    await callbackServer.start();
  }, 60000);

  it('should include all job details in callback', async () => {
    const payload = createWebhookPayload({
      task: {
        description: 'Detailed task for callback testing',
        priority: 'high',
      },
      organization: {
        id: 'org-callback-test',
        name: 'Callback Test Org',
        installationId: 11111,
      },
      repository: {
        owner: 'callback-owner',
        name: 'callback-repo',
        defaultBranch: 'develop',
      },
      callback: {
        url: callbackServer.getUrl(),
      },
    });

    const response = await request
      .post('/webhook')
      .send(payload)
      .expect(202);

    const jobId = response.body.jobId;
    createdJobIds.add(jobId);

    // Wait for completion
    await waitForJobCompletion(queue, jobId, 30000);
    await waitUntil(() => callbackServer.getCallbacks().length > 0, 5000);

    const callbacks = callbackServer.getCallbacks();
    const callbackPayload = callbacks[0].payload;

    // Verify all expected fields are present
    expect(callbackPayload).toHaveProperty('jobId');
    expect(callbackPayload).toHaveProperty('status');
    expect(callbackPayload).toHaveProperty('success');
    expect(callbackPayload).toHaveProperty('message');
    expect(callbackPayload).toHaveProperty('pullRequestUrl');
    expect(callbackPayload).toHaveProperty('completedAt');

    // Verify jobId matches
    expect(callbackPayload.jobId).toBe(jobId);
  }, 60000);

  it('should send callback only once per job', async () => {
    const payload = createWebhookPayload({
      task: {
        description: 'Task to test single callback',
        priority: 'normal',
      },
      callback: {
        url: callbackServer.getUrl(),
      },
    });

    const response = await request
      .post('/webhook')
      .send(payload)
      .expect(202);

    const jobId = response.body.jobId;
    createdJobIds.add(jobId);

    // Wait for completion
    await waitForJobCompletion(queue, jobId, 30000);
    await waitUntil(() => callbackServer.getCallbacks().length > 0, 5000);

    // Wait a bit more to ensure no duplicate callbacks
    await new Promise(resolve => setTimeout(resolve, 2000));

    const callbacks = callbackServer.getCallbacks();
    expect(callbacks).toHaveLength(1);
  }, 60000);
});
