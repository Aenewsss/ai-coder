import { FastifyPluginAsync } from 'fastify';
import { checkpointManager } from '../../agent/checkpoint.js';
import { jobQueue, getJobStatus } from '../../jobs/queue.js';

export const checkpointRoutes: FastifyPluginAsync = async (fastify) => {
  // Get checkpoint metadata for a job
  fastify.get<{
    Params: { jobId: string };
  }>('/checkpoints/:jobId', async (request, reply) => {
    const { jobId } = request.params;

    const metadata = await checkpointManager.getCheckpointMetadata(jobId);

    if (!metadata) {
      return reply.status(404).send({
        error: 'Checkpoint not found',
        message: `No checkpoint exists for job ${jobId}`,
      });
    }

    return {
      jobId,
      metadata,
    };
  });

  // Check if a job can be resumed
  fastify.get<{
    Params: { jobId: string };
  }>('/checkpoints/:jobId/can-resume', async (request, reply) => {
    const { jobId } = request.params;

    const hasCheckpoint = await checkpointManager.hasCheckpoint(jobId);
    const jobStatus = await getJobStatus(jobId);

    const canResume = hasCheckpoint && (jobStatus.status === 'failed' || jobStatus.status === 'unknown');

    return {
      jobId,
      canResume,
      hasCheckpoint,
      jobStatus: jobStatus.status,
    };
  });

  // Resume a failed job from checkpoint
  fastify.post<{
    Params: { jobId: string };
    Body: { callback?: { url: string } };
  }>('/checkpoints/:jobId/resume', async (request, reply) => {
    const { jobId } = request.params;
    const { callback } = request.body;

    // Check if checkpoint exists
    const checkpoint = await checkpointManager.loadCheckpoint(jobId);

    if (!checkpoint) {
      return reply.status(404).send({
        error: 'Checkpoint not found',
        message: `No checkpoint exists for job ${jobId}. Cannot resume.`,
      });
    }

    // Check job status
    const jobStatus = await getJobStatus(jobId);

    if (jobStatus.status === 'active' || jobStatus.status === 'queued') {
      return reply.status(400).send({
        error: 'Job already running',
        message: `Job ${jobId} is currently ${jobStatus.status}. Cannot resume.`,
      });
    }

    if (jobStatus.status === 'completed') {
      return reply.status(400).send({
        error: 'Job already completed',
        message: `Job ${jobId} has already completed successfully. Cannot resume.`,
      });
    }

    // Get the original job to extract its data
    const originalJob = await jobQueue.getJob(jobId);

    if (!originalJob) {
      return reply.status(404).send({
        error: 'Original job not found',
        message: `Cannot find original job data for ${jobId}`,
      });
    }

    // Create a new job with the same data but marked for resume
    const newJob = await jobQueue.add('process-task', {
      ...originalJob.data,
      // Override callback if provided
      callback: callback || originalJob.data.callback,
      // Add metadata to indicate this is a resume
      _resume: {
        fromJobId: jobId,
        resumedAt: new Date().toISOString(),
      },
    });

    fastify.log.info(
      {
        originalJobId: jobId,
        newJobId: newJob.id,
        resumedTurns: checkpoint.turns,
      },
      'Job resumed from checkpoint'
    );

    return {
      message: 'Job resumed from checkpoint',
      originalJobId: jobId,
      newJobId: newJob.id!,
      resumedFrom: {
        turns: checkpoint.turns,
        messageCount: checkpoint.messages.length,
        lastUpdated: checkpoint.lastUpdated,
      },
    };
  });

  // Delete a checkpoint manually
  fastify.delete<{
    Params: { jobId: string };
  }>('/checkpoints/:jobId', async (request, reply) => {
    const { jobId } = request.params;

    const hasCheckpoint = await checkpointManager.hasCheckpoint(jobId);

    if (!hasCheckpoint) {
      return reply.status(404).send({
        error: 'Checkpoint not found',
        message: `No checkpoint exists for job ${jobId}`,
      });
    }

    await checkpointManager.deleteCheckpoint(jobId);

    return {
      message: 'Checkpoint deleted successfully',
      jobId,
    };
  });

  // List all active checkpoints
  fastify.get('/checkpoints', async () => {
    const activeCheckpoints = await checkpointManager.listActiveCheckpoints();

    const checkpointsWithMetadata = await Promise.all(
      activeCheckpoints.map(async (jobId) => {
        const metadata = await checkpointManager.getCheckpointMetadata(jobId);
        const jobStatus = await getJobStatus(jobId);

        return {
          jobId,
          metadata,
          jobStatus: jobStatus.status,
        };
      })
    );

    return {
      total: checkpointsWithMetadata.length,
      checkpoints: checkpointsWithMetadata,
    };
  });
};
