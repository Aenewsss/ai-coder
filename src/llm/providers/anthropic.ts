import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ContentBlock as AnthropicContentBlock,
  ToolUseBlock,
  TextBlock,
} from '@anthropic-ai/sdk/resources/messages.js';
import { LLMProvider, LLMResponse, Message, Tool, ToolCall, ContentBlock } from '../types.js';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(apiKey: string, model = 'claude-sonnet-4-20250514', maxTokens = 8192) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  async chat(
    systemPrompt: string,
    messages: Message[],
    tools: Tool[]
  ): Promise<LLMResponse> {
    // Convert our generic messages to Anthropic format
    const anthropicMessages: MessageParam[] = messages.map((msg) => ({
      role: msg.role,
      content: msg.content as string | AnthropicContentBlock[],
    }));

    // Call Anthropic API (cast tools to Anthropic SDK type)
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      tools: tools as Anthropic.Tool[],
      messages: anthropicMessages,
    });

    // Extract tool calls
    const toolCalls: ToolCall[] = response.content
      .filter((block): block is ToolUseBlock => block.type === 'tool_use')
      .map((block) => ({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      }));

    // Convert response to our generic format, filtering only known types
    const content: ContentBlock[] = response.content
      .filter((block) => block.type === 'text' || block.type === 'tool_use')
      .map((block) => {
        if (block.type === 'text') {
          return {
            type: 'text' as const,
            text: block.text,
          };
        } else if (block.type === 'tool_use') {
          return {
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          };
        }
        // This should never happen due to the filter above
        throw new Error(`Unknown block type: ${(block as any).type}`);
      });

    return {
      content,
      stopReason: this.mapStopReason(response.stop_reason),
      toolCalls,
    };
  }

  private mapStopReason(
    stopReason: string | null
  ): 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' {
    if (stopReason === 'end_turn') return 'end_turn';
    if (stopReason === 'tool_use') return 'tool_use';
    if (stopReason === 'max_tokens') return 'max_tokens';
    if (stopReason === 'stop_sequence') return 'stop_sequence';
    return 'end_turn';
  }
}
