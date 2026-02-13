import OpenAI from 'openai';
import { LLMProvider, LLMResponse, Message, Tool, ToolCall, ContentBlock } from '../types.js';

export class GroqProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(apiKey: string, model = 'llama-3.3-70b-versatile', maxTokens = 8192) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  async chat(
    systemPrompt: string,
    messages: Message[],
    tools: Tool[]
  ): Promise<LLMResponse> {
    // Convert messages to OpenAI format
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...this.convertMessages(messages),
    ];

    // Convert tools to OpenAI format
    const openaiTools = this.convertTools(tools);

    // Call Groq API (OpenAI-compatible)
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      max_tokens: this.maxTokens,
    });

    return this.convertResponse(response);
  }

  private convertMessages(
    messages: Message[]
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return {
          role: msg.role,
          content: msg.content,
        } as OpenAI.Chat.ChatCompletionMessageParam;
      }

      // Handle complex content blocks
      const contentBlocks = msg.content as ContentBlock[];

      // If it's an assistant message with tool use
      if (msg.role === 'assistant') {
        const textBlocks = contentBlocks.filter((b) => b.type === 'text');
        const toolUseBlocks = contentBlocks.filter((b) => b.type === 'tool_use');

        const toolCalls = toolUseBlocks.map((block) => ({
          id: block.id!,
          type: 'function' as const,
          function: {
            name: block.name!,
            arguments: JSON.stringify(block.input || {}),
          },
        }));

        const content = textBlocks.map((b) => b.text).join('\n') || null;

        return {
          role: 'assistant',
          content,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        } as OpenAI.Chat.ChatCompletionAssistantMessageParam;
      }

      // If it's a user message with tool results
      if (msg.role === 'user') {
        const toolResultBlocks = contentBlocks.filter((b) => b.type === 'tool_result');

        if (toolResultBlocks.length > 0) {
          // OpenAI expects separate tool messages
          return toolResultBlocks.map((block) => ({
            role: 'tool' as const,
            tool_call_id: block.tool_use_id!,
            content: block.content || '',
          })) as unknown as OpenAI.Chat.ChatCompletionMessageParam;
        }
      }

      // Fallback: extract text
      const text = this.extractText(contentBlocks);
      return {
        role: msg.role,
        content: text,
      } as OpenAI.Chat.ChatCompletionMessageParam;
    }).flat(); // Flatten because tool results might create multiple messages
  }

  private convertTools(tools: Tool[]): OpenAI.Chat.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));
  }

  private convertResponse(response: OpenAI.Chat.ChatCompletion): LLMResponse {
    const choice = response.choices[0];
    const message = choice.message;

    // Extract tool calls (only function tool calls)
    const toolCalls: ToolCall[] =
      message.tool_calls
        ?.filter((tc) => tc.type === 'function')
        .map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        })) || [];

    // Build content blocks
    const content: ContentBlock[] = [];

    if (message.content) {
      content.push({
        type: 'text',
        text: message.content,
      });
    }

    // Add tool use blocks (only function tool calls)
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        if (tc.type === 'function') {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          });
        }
      }
    }

    // Determine stop reason
    let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' = 'end_turn';

    if (choice.finish_reason === 'tool_calls') {
      stopReason = 'tool_use';
    } else if (choice.finish_reason === 'length') {
      stopReason = 'max_tokens';
    } else if (choice.finish_reason === 'stop') {
      stopReason = 'end_turn';
    }

    return {
      content,
      stopReason,
      toolCalls,
    };
  }

  private extractText(content: ContentBlock[]): string {
    return content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }
}
