import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        }
      : undefined,
  redact: {
    paths: ['ANTHROPIC_API_KEY', 'GITHUB_APP_PRIVATE_KEY', '*.token', '*.password'],
    censor: '[REDACTED]',
  },
});

export function createJobLogger(jobId: string) {
  return logger.child({ jobId });
}
