import { env } from '../config/env.js';
import { LLMProvider } from './types.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { DeepSeekProvider } from './providers/deepseek.js';
import { GroqProvider } from './providers/groq.js';

export interface LLMProviderOptions {
  /**
   * Override the default model for this provider
   * Useful for dynamic model selection based on task complexity
   */
  model?: string;
}

/**
 * Creates an LLM provider instance based on the environment configuration
 * @param options - Optional configuration to override defaults
 * @returns LLMProvider instance
 * @throws Error if the provider is not supported
 */
export function createLLMProvider(options?: LLMProviderOptions): LLMProvider {
  const maxTokens = env.LLM_MAX_TOKENS;

  switch (env.LLM_PROVIDER) {
    case 'anthropic':
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required when using anthropic provider');
      }
      return new AnthropicProvider(
        env.ANTHROPIC_API_KEY,
        options?.model || env.CLAUDE_MODEL,
        maxTokens
      );

    case 'deepseek':
      if (!env.DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY is required when using deepseek provider');
      }
      return new DeepSeekProvider(
        env.DEEPSEEK_API_KEY,
        options?.model || env.DEEPSEEK_MODEL,
        maxTokens
      );

    case 'groq':
      if (!env.GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY is required when using groq provider');
      }
      return new GroqProvider(
        env.GROQ_API_KEY,
        options?.model || env.GROQ_MODEL,
        maxTokens
      );

    default:
      throw new Error(`Unknown LLM provider: ${env.LLM_PROVIDER}`);
  }
}
