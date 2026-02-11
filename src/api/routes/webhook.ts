import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { addJob, JobData } from '../../jobs/queue.js';
import { logger } from '../../utils/logger.js';

const webhookBodySchema = z.object({
  task: z.object({
    description: z.string().min(1).max(10000),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
  }),
  organization: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    installationId: z.number().int().positive(),
  }),
  repository: z.object({
    owner: z.string().min(1),
    name: z.string().min(1),
    defaultBranch: z.string().min(1).default('main'),
  }),
  callback: z
    .object({
      url: z.string().url(),
    })
    .optional(),
});

type WebhookBody = z.infer<typeof webhookBodySchema>;

export async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/webhook',
    async (
      request: FastifyRequest<{ Body: WebhookBody }>,
      reply: FastifyReply
    ) => {
      // Validate request body
      const parseResult = webhookBodySchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const body = parseResult.data;

      logger.info(
        {
          org: body.organization.name,
          repo: `${body.repository.owner}/${body.repository.name}`,
          task: body.task.description.slice(0, 100),
        },
        'Received webhook'
      );

      // Add job to queue
      const jobData: JobData = {
        task: body.task,
        organization: body.organization,
        repository: body.repository,
        callback: body.callback,
      };

      const jobId = await addJob(jobData);

      logger.info({ jobId }, 'Job queued');

      return reply.status(202).send({
        jobId,
        status: 'queued',
        statusUrl: `/jobs/${jobId}`,
      });
    }
  );
}
