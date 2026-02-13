import { env } from '../config/env.js';
import { Workspace } from '../sandbox/workspace.js';
import { toolDefinitions, executeTool } from '../tools/index.js';
import { getSystemPrompt } from './prompts/system.js';
import { logger } from '../utils/logger.js';
import { AgentError } from '../utils/errors.js';
import { createLLMProvider, Message, ContentBlock } from '../llm/index.js';
import { selectDeepSeekModel } from './task-analyzer.js';

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 10000;
const RETRYABLE_STATUS_CODES = [429, 529, 500, 502, 503, 504];

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return RETRYABLE_STATUS_CODES.some((code) => message.includes(String(code)));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface AgentResult {
  success: boolean;
  summary: string;
  pullRequestUrl?: string;
  error?: string;
  turns: number;
}

export type OnProgressCallback = (turn: number, maxTurns: number) => void;

export async function runAgentLoop(
  workspace: Workspace,
  taskDescription: string,
  jobId: string,
  onProgress?: OnProgressCallback
): Promise<AgentResult> {
  const log = logger.child({ jobId, workspaceId: workspace.id });
  const { owner, repo, defaultBranch } = workspace.config;

  // Select appropriate model based on task complexity (for DeepSeek)
  let selectedModel: string | undefined;

  if (env.LLM_PROVIDER === 'deepseek') {
    const selection = selectDeepSeekModel(taskDescription);
    selectedModel = selection.model;

    log.info(
      {
        model: selectedModel,
        complexity: selection.complexity,
        reason: selection.reason,
        isDynamic: selection.isDynamic,
      },
      'DeepSeek model selected based on task complexity'
    );
  }

  // Create LLM provider based on configuration
  const llmProvider = createLLMProvider(selectedModel ? { model: selectedModel } : undefined);

  const currentModel = env.LLM_PROVIDER === 'anthropic'
    ? env.CLAUDE_MODEL
    : env.LLM_PROVIDER === 'deepseek'
      ? (selectedModel || env.DEEPSEEK_MODEL)
      : env.GROQ_MODEL;

  log.info({ provider: env.LLM_PROVIDER, model: currentModel }, 'Using LLM provider');

  const systemPrompt = getSystemPrompt({ owner, repo, defaultBranch });

  const messages: Message[] = [
    {
      role: 'user',
      content: `Please complete the following task:\n\n${taskDescription}`,
    },
  ];

  let turns = 0;
  const maxTurns = env.MAX_AGENT_TURNS;

  log.info({ taskDescription }, 'Starting agent loop');

  while (turns < maxTurns) {
    turns++; 
    
    log.debug({ turn: turns }, 'Agent turn');
    onProgress?.(turns, maxTurns);

    try {
      const response = await llmProvider.chat(systemPrompt, messages, toolDefinitions);

      // Process the response
      const assistantContent: ContentBlock[] = response.content;

      // Add assistant message to history (include reasoning_content for DeepSeek thinking mode)
      const assistantMessage: Message = {
        role: 'assistant',
        content: assistantContent,
      };
      if (response.reasoning_content) {
        assistantMessage.reasoning_content = response.reasoning_content;
      }
      messages.push(assistantMessage);

      // Check stop reason
      if (response.stopReason === 'end_turn') {
        // Model finished without tool use
        const textContent = assistantContent
          .filter((block) => block.type === 'text')
          .map((block) => block.text || '')
          .join('\n');

        log.info({ turns }, 'Agent completed without explicit task_complete');

        return {
          success: true,
          summary: textContent || 'Task completed.',
          turns,
        };
      }

      if (response.stopReason === 'tool_use') {
        // Execute tools
        const toolUseBlocks = assistantContent.filter(
          (block) => block.type === 'tool_use'
        );

        const toolResults: ContentBlock[] = [];

        for (const toolUse of toolUseBlocks) {
          const toolName = toolUse.name || 'unknown';
          log.debug({ tool: toolName, input: toolUse.input }, 'Executing tool');

          try {
            const result = await executeTool(
              workspace,
              toolName,
              toolUse.input as Record<string, unknown>
            );

            // Check if task is complete
            if (typeof result === 'object' && 'complete' in result && result.complete) {
              log.info({ summary: result.summary, prUrl: result.pullRequestUrl, turns }, 'Task completed');

              return {
                success: true,
                summary: result.summary,
                pullRequestUrl: result.pullRequestUrl,
                turns,
              };
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: result as string,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.warn({ tool: toolName, error: errorMessage }, 'Tool execution failed');

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `Error: ${errorMessage}`,
              is_error: true,
            });
          }
        }

        // Add tool results to messages
        messages.push({
          role: 'user',
          content: toolResults,
        });
      } else {
        // Unexpected stop reason
        log.warn({ stopReason: response.stopReason }, 'Unexpected stop reason');
        break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (isRetryableError(error)) {
        let retried = false;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          log.warn({ error: errorMessage, turn: turns, attempt, delayMs: delay }, 'Retryable API error, waiting before retry');
          await sleep(delay);

          try {
            const retryResponse = await llmProvider.chat(systemPrompt, messages, toolDefinitions);

            // Re-inject the successful response by pushing it back and re-processing
            // We decrement turns so the while loop increments it back
            turns--;
            const retryMessage: Message = { role: 'assistant', content: retryResponse.content };
            if (retryResponse.reasoning_content) {
              retryMessage.reasoning_content = retryResponse.reasoning_content;
            }
            messages.push(retryMessage);

            // Need to handle the response inline since we broke out of the retry loop
            if (retryResponse.stopReason === 'end_turn') {
              const textContent = retryResponse.content
                .filter((block) => block.type === 'text')
                .map((block) => block.text || '')
                .join('\n');
              log.info({ turns: turns + 1 }, 'Agent completed after retry');
              return { success: true, summary: textContent || 'Task completed.', turns: turns + 1 };
            }

            if (retryResponse.stopReason === 'tool_use') {
              const toolUseBlocks = retryResponse.content.filter(
                (block) => block.type === 'tool_use'
              );
              const toolResults: ContentBlock[] = [];
              for (const toolUse of toolUseBlocks) {
                const toolName = toolUse.name || 'unknown';
                log.debug({ tool: toolName, input: toolUse.input }, 'Executing tool');
                try {
                  const result = await executeTool(workspace, toolName, toolUse.input as Record<string, unknown>);
                  if (typeof result === 'object' && 'complete' in result && result.complete) {
                    log.info({ summary: result.summary, prUrl: result.pullRequestUrl, turns: turns + 1 }, 'Task completed after retry');
                    return { success: true, summary: result.summary, pullRequestUrl: result.pullRequestUrl, turns: turns + 1 };
                  }
                  toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result as string });
                } catch (toolError) {
                  const toolErrorMsg = toolError instanceof Error ? toolError.message : String(toolError);
                  log.warn({ tool: toolName, error: toolErrorMsg }, 'Tool execution failed');
                  toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: `Error: ${toolErrorMsg}`, is_error: true });
                }
              }
              messages.push({ role: 'user', content: toolResults });
            }

            log.info({ attempt }, 'Retry succeeded');
            retried = true;
            break;
          } catch (retryError) {
            const retryErrorMsg = retryError instanceof Error ? retryError.message : String(retryError);
            if (attempt === MAX_RETRIES || !isRetryableError(retryError)) {
              log.error({ error: retryErrorMsg, turn: turns, attempt }, 'All retries exhausted');
              throw new AgentError(`Agent failed on turn ${turns} after ${attempt} retries: ${retryErrorMsg}`, {
                turn: turns,
                error: retryErrorMsg,
              });
            }
          }
        }
        if (retried) continue;
      }

      log.error({ error: errorMessage, turn: turns }, 'Agent loop error');
      throw new AgentError(`Agent failed on turn ${turns}: ${errorMessage}`, {
        turn: turns,
        error: errorMessage,
      });
    }
  }

  log.warn({ maxTurns }, 'Agent reached maximum turns');

  return {
    success: false,
    summary: `Agent reached maximum turns (${maxTurns}) without completing the task.`,
    turns,
    error: 'MAX_TURNS_EXCEEDED',
  };
}
