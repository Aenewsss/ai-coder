import pino from 'pino';
import { env } from '../config/env.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, '../../logs');

// Create logs directory if it doesn't exist
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const getTransport = () => {
  if (env.NODE_ENV === 'development') {
    // In development: pretty console + file logging
    return {
      targets: [
        {
          target: 'pino-pretty',
          level: 'debug',
          options: {
            colorize: true,
          },
        },
        {
          target: 'pino/file',
          level: 'debug',
          options: {
            destination: path.join(logsDir, 'app.log'),
            mkdir: true,
          },
        },
      ],
    };
  } else {
    // In production: file logging only
    return {
      targets: [
        {
          target: 'pino/file',
          level: 'info',
          options: {
            destination: path.join(logsDir, 'app.log'),
            mkdir: true,
          },
        },
      ],
    };
  }
};

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: getTransport(),
  redact: {
    paths: ['ANTHROPIC_API_KEY', 'GITHUB_APP_PRIVATE_KEY', '*.token', '*.password'],
    censor: '[REDACTED]',
  },
});

export function createJobLogger(jobId: string) {
  return logger.child({ jobId });
}
