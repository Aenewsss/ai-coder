export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
  tool_use_id?: string;
  is_error?: boolean;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
  reasoning_content?: string; // For DeepSeek thinking mode
}

export interface Tool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMResponse {
  content: ContentBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  toolCalls: ToolCall[];
  reasoning_content?: string; // For DeepSeek thinking mode
}

export interface LLMProvider {
  /**
   * Send a chat request to the LLM provider
   * @param systemPrompt - System prompt for the model
   * @param messages - Conversation history
   * @param tools - Available tools for function calling
   * @returns LLM response with content and tool calls
   */
  chat(
    systemPrompt: string,
    messages: Message[],
    tools: Tool[]
  ): Promise<LLMResponse>;
}
