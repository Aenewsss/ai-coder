import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-20250514'),

  // GitHub App
  GITHUB_APP_ID: z.coerce.number().min(1, 'GITHUB_APP_ID is required'),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1, 'GITHUB_APP_PRIVATE_KEY is required'),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // Workspace
  WORKSPACE_BASE_PATH: z.string().default('/tmp/ai-coder-workspaces'),

  // Agent
  MAX_AGENT_TURNS: z.coerce.number().default(50),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Environment validation failed:');
    for (const error of result.error.errors) {
      console.error(`  - ${error.path.join('.')}: ${error.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
