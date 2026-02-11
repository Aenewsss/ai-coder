import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getJobStatus } from '../../jobs/queue.js';

interface JobParams {
  id: string;
}

export async function jobRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/jobs/:id',
    async (
      request: FastifyRequest<{ Params: JobParams }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;

      const { status, result, progress } = await getJobStatus(id);

      if (status === 'unknown') {
        return reply.status(404).send({
          error: 'Job not found',
          jobId: id,
        });
      }

      const response: Record<string, unknown> = {
        jobId: id,
        status,
      };

      if (progress !== undefined) {
        response.progress = progress;
      }

      if (result) {
        response.success = result.success;
        response.message = result.message;

        if (result.pullRequestUrl) {
          response.pullRequestUrl = result.pullRequestUrl;
        }

        if (result.error) {
          response.error = result.error;
        }
      }

      return reply.send(response);
    }
  );
}
