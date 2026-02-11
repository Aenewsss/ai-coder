import { FastifyInstance } from 'fastify';
import { redisConnection } from '../../jobs/queue.js';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async (_request, reply) => {
    const checks = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      redis: 'unknown' as 'ok' | 'error' | 'unknown',
    };

    try {
      await redisConnection.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
      checks.status = 'degraded';
    }

    const statusCode = checks.status === 'ok' ? 200 : 503;
    return reply.status(statusCode).send(checks);
  });

  fastify.get('/ready', async (_request, reply) => {
    try {
      await redisConnection.ping();
      return reply.status(200).send({ ready: true });
    } catch {
      return reply.status(503).send({ ready: false, error: 'Redis not available' });
    }
  });
}
