import { Job } from 'bullmq';
import { JobData, JobResult } from './queue.js';
import { sendCallback } from './callback.js';
import { createWorkspace, cleanupJobWorkspaces } from '../sandbox/workspace.js';
import { runAgentLoop } from '../agent/loop.js';
import { createJobLogger } from '../utils/logger.js';
import { env } from '../config/env.js';

export async function processJob(job: Job<JobData, JobResult>): Promise<JobResult> {
  const log = createJobLogger(job.id!);
  const { task, organization, repository, callback } = job.data;

  log.info(
    {
      org: organization.name,
      repo: `${repository.owner}/${repository.name}`,
      task: task.description.slice(0, 100),
    },
    'Processing job'
  );

  let result: JobResult;

  try {
    // Update progress
    await job.updateProgress({ percentage: 10 });

    // Create workspace
    const workspace = await createWorkspace({
      owner: repository.owner,
      repo: repository.name,
      defaultBranch: repository.defaultBranch,
      installationId: organization.installationId,
      jobId: job.id!,
    });

    await job.updateProgress({ percentage: 20, turn: 0, maxTurns: env.MAX_AGENT_TURNS });

    try {
      // Run agent loop
      const agentResult = await runAgentLoop(workspace, task.description, job.id!, (turn, maxTurns) => {
        const percentage = 20 + Math.floor((turn / maxTurns) * 70);
        job.updateProgress({ percentage, turn, maxTurns });
      });

      await job.updateProgress({ percentage: 90 });

      result = {
        success: agentResult.success,
        message: agentResult.summary,
        pullRequestUrl: agentResult.pullRequestUrl,
        error: agentResult.error,
      };
    } finally {
      // Always cleanup workspace
      await cleanupJobWorkspaces(job.id!);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ error: errorMessage }, 'Job processing failed');

    result = {
      success: false,
      message: 'Job processing failed',
      error: errorMessage,
    };
  }

  await job.updateProgress({ percentage: 100 });

  // Send callback if configured
  if (callback?.url) {
    await sendCallback(callback.url, {
      jobId: job.id!,
      status: result.success ? 'completed' : 'failed',
      success: result.success,
      message: result.message,
      pullRequestUrl: result.pullRequestUrl,
      error: result.error,
      completedAt: new Date().toISOString(),
    });
  }

  log.info({ success: result.success, prUrl: result.pullRequestUrl }, 'Job completed');

  return result;
}
