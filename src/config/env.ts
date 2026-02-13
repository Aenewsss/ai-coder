import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // LLM Provider
  LLM_PROVIDER: z.enum(['anthropic', 'deepseek', 'groq']).default('anthropic'),
  LLM_MAX_TOKENS: z.coerce.number().default(8192),

  // Anthropic (optional if using another provider)
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-20250514'),

  // DeepSeek (optional)
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().default('deepseek-chat'),

  // DeepSeek Dynamic Model Selection
  // Enable automatic model selection based on task complexity
  DEEPSEEK_DYNAMIC_MODEL: z.enum(['true', 'false']).default('false'),
  // Model to use for simple tasks (fast, cheap)
  DEEPSEEK_SIMPLE_MODEL: z.string().default('deepseek-chat'),
  // Model to use for complex tasks (reasoning, planning)
  DEEPSEEK_COMPLEX_MODEL: z.string().default('deepseek-reasoner'),

  // Groq (optional)
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),

  // GitHub App
  GITHUB_APP_ID: z.coerce.number().min(1, 'GITHUB_APP_ID is required'),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1, 'GITHUB_APP_PRIVATE_KEY is required'),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // Workspace
  WORKSPACE_BASE_PATH: z.string().default('/tmp/ai-coder-workspaces'),

  // Agent
  MAX_AGENT_TURNS: z.coerce.number().default(100),
}).refine(
  (data) => {
    // Validate that the required API key for the selected provider is present
    if (data.LLM_PROVIDER === 'anthropic' && !data.ANTHROPIC_API_KEY) {
      return false;
    }
    if (data.LLM_PROVIDER === 'deepseek' && !data.DEEPSEEK_API_KEY) {
      return false;
    }
    if (data.LLM_PROVIDER === 'groq' && !data.GROQ_API_KEY) {
      return false;
    }
    return true;
  },
  (data) => ({
    message: `API key for provider "${data.LLM_PROVIDER}" is required`,
    path: [`${data.LLM_PROVIDER.toUpperCase()}_API_KEY`],
  })
);

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
