import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { healthRoutes } from './routes/health.js';
import { webhookRoutes } from './routes/webhook.js';
import { jobRoutes } from './routes/jobs.js';

export async function createServer() {
  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    requestTimeout: 30000,
    bodyLimit: 1048576, // 1MB
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST'],
  });

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(webhookRoutes);
  await fastify.register(jobRoutes);

  // Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    const err = error as Error & { statusCode?: number };
    logger.error(
      {
        error: err.message,
        stack: err.stack,
        url: request.url,
        method: request.method,
      },
      'Request error'
    );

    const statusCode = err.statusCode || 500;
    const response: Record<string, unknown> = {
      error: statusCode >= 500 ? 'Internal server error' : err.message,
    };

    if (env.NODE_ENV !== 'production' && statusCode >= 500) {
      response.stack = err.stack;
    }

    return reply.status(statusCode).send(response);
  });

  return fastify;
}

export async function startServer() {
  const server = await createServer();

  try {
    await server.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });

    logger.info({ port: env.PORT }, 'Server started');

    return server;
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}
