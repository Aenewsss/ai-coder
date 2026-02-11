import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ContentBlock,
  ToolResultBlockParam,
  TextBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages.js';
import { env } from '../config/env.js';
import { Workspace } from '../sandbox/workspace.js';
import { toolDefinitions, executeTool, ToolResult } from '../tools/index.js';
import { getSystemPrompt } from './prompts/system.js';
import { logger } from '../utils/logger.js';
import { AgentError } from '../utils/errors.js';

const anthropic = new Anthropic();

export interface AgentResult {
  success: boolean;
  summary: string;
  pullRequestUrl?: string;
  error?: string;
  turns: number;
}

export async function runAgentLoop(
  workspace: Workspace,
  taskDescription: string,
  jobId: string
): Promise<AgentResult> {
  const log = logger.child({ jobId, workspaceId: workspace.id });
  const { owner, repo, defaultBranch } = workspace.config;

  const systemPrompt = getSystemPrompt({ owner, repo, defaultBranch });

  const messages: MessageParam[] = [
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

    try {
      const response = await anthropic.messages.create({
        model: env.CLAUDE_MODEL,
        max_tokens: 8192,
        system: systemPrompt,
        tools: toolDefinitions,
        messages,
      });

      // Process the response
      const assistantContent: ContentBlock[] = response.content;

      // Add assistant message to history
      messages.push({
        role: 'assistant',
        content: assistantContent,
      });

      // Check stop reason
      if (response.stop_reason === 'end_turn') {
        // Model finished without tool use
        const textContent = assistantContent
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n');

        log.info({ turns }, 'Agent completed without explicit task_complete');

        return {
          success: true,
          summary: textContent || 'Task completed.',
          turns,
        };
      }

      if (response.stop_reason === 'tool_use') {
        // Execute tools
        const toolUseBlocks = assistantContent.filter(
          (block): block is ToolUseBlock => block.type === 'tool_use'
        );

        const toolResults: ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          log.debug({ tool: toolUse.name, input: toolUse.input }, 'Executing tool');

          try {
            const result = await executeTool(
              workspace,
              toolUse.name,
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
            log.warn({ tool: toolUse.name, error: errorMessage }, 'Tool execution failed');

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
        log.warn({ stopReason: response.stop_reason }, 'Unexpected stop reason');
        break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
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
