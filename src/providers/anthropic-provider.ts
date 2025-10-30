import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from './base-provider';
import { AnthropicProviderConfig, GenerationMetadata, TokenUsage } from '../types/provider';
import { GenerateArgs, Message, Tool, ToolCall } from '../types/worker';
import { TokenStreamChunk } from '../types/session';
import { logger } from '../utils/logger';

/**
 * Anthropic Claude API provider using official Anthropic SDK
 * Supports streaming, tool calling, thinking blocks, and prompt caching
 */
export class AnthropicProvider extends BaseProvider {
  declare config: AnthropicProviderConfig;
  private client: Anthropic | null = null;
  private requestCounter = 0;

  constructor(config: AnthropicProviderConfig) {
    super(config);
  }

  /**
   * Initialize the Anthropic provider
   * Uses official Anthropic SDK
   */
  async initialize(): Promise<void> {
    this.assertNotDisposed();

    if (this._initialized) {
      logger.anthropicProvider.debug('AnthropicProvider already initialized');
      return;
    }

    logger.anthropicProvider.info('Initializing AnthropicProvider', {
      model: this.config.model
    });

    const initStartTime = Date.now();

    // Emit init start event
    this.events.emit({
      type: 'provider:init:start',
      provider: 'anthropic',
      model: this.config.model,
      timestamp: initStartTime
    });

    try {
      // Create Anthropic client
      this.client = new Anthropic({
        apiKey: this.config.apiKey,
        maxRetries: this.config.maxRetries ?? 2,
        dangerouslyAllowBrowser: true
      });

      this._initialized = true;

      // Emit init complete event
      this.events.emit({
        type: 'provider:init:complete',
        provider: 'anthropic',
        model: this.config.model,
        duration: Date.now() - initStartTime,
        timestamp: Date.now()
      });

      logger.anthropicProvider.info('AnthropicProvider initialized successfully', {
        model: this.config.model,
        duration: Date.now() - initStartTime
      });
    } catch (error: any) {
      this.events.emit({
        type: 'provider:error',
        provider: 'anthropic',
        model: this.config.model,
        error,
        timestamp: Date.now()
      });

      logger.anthropicProvider.error('AnthropicProvider initialization failed', {
        model: this.config.model,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Generate a response stream using Anthropic Claude API
   */
  async *generate(args: GenerateArgs): AsyncIterable<TokenStreamChunk> {
    this.assertReady();

    if (!this.client) {
      throw new Error('Anthropic client not initialized');
    }

    const requestId = String(++this.requestCounter);
    const requestStartTime = Date.now();

    // Clear previous metadata
    this.clearMetadata();

    // Emit request start event
    this.events.emit({
      type: 'provider:request:start',
      provider: 'anthropic',
      model: this.config.model,
      timestamp: requestStartTime
    });

    logger.anthropicProvider.debug('Starting generation', {
      model: this.config.model,
      requestId,
      messageCount: args.messages.length,
      hasTools: !!args.tools && args.tools.length > 0,
      enableThinking: args.enable_thinking
    });

    try {
      // Convert messages to Anthropic format
      const { system, messages } = this.convertMessages(args.messages);

      // Convert tools to Anthropic format
      const tools = args.tools && args.tools.length > 0
        ? this.convertTools(args.tools)
        : undefined;

      // Create streaming request parameters
      const requestParams: Anthropic.MessageCreateParams = {
        model: this.config.model,
        messages,
        max_tokens: args.max_new_tokens ?? 4096,
        stream: true
      };

      // Add system prompt if present
      if (system) requestParams.system = system;

      // Add tools if present
      if (tools) requestParams.tools = tools;

      // Add generation parameters
      if (args.temperature !== undefined) requestParams.temperature = args.temperature;
      if (args.top_p !== undefined) requestParams.top_p = args.top_p;
      if (args.stop !== undefined) requestParams.stop_sequences = args.stop;

      // Claude-specific: thinking mode (extended thinking)
      if (args.enable_thinking) {
        (requestParams as any).thinking = {
          type: 'enabled',
          budget_tokens: 1024
        };
      }

      const stream = await this.client.messages.stream(requestParams);

      let fullContent = '';
      let tokenCount = 0;
      let ttfbMs: number | undefined;
      let usage: TokenUsage | undefined;
      let finishReason: string | undefined;
      let toolCalls: ToolCall[] | undefined;
      let thinkingContent = '';
      let currentToolUseIndex = -1;
      const toolUseMap = new Map<string, number>();

      // Stream tokens
      for await (const chunk of stream) {
        // Handle different event types
        if (chunk.type === 'message_start') {
          // Message metadata
          if (chunk.message.usage) {
            usage = {
              prompt_tokens: chunk.message.usage.input_tokens,
              completion_tokens: 0,
              total_tokens: chunk.message.usage.input_tokens
            };
          }
        } else if (chunk.type === 'content_block_start') {
          const block = chunk.content_block;

          // Handle tool use blocks
          if (block.type === 'tool_use') {
            currentToolUseIndex++;
            if (!toolCalls) {
              toolCalls = [];
            }
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: {}
              }
            });
            toolUseMap.set(block.id, currentToolUseIndex);
          }
        } else if (chunk.type === 'content_block_delta') {
          const delta = chunk.delta;

          // Capture TTFB on first content token
          if (tokenCount === 0 && delta.type === 'text_delta') {
            ttfbMs = Date.now() - requestStartTime;
          }

          // Handle text deltas
          if (delta.type === 'text_delta') {
            const token = delta.text;
            fullContent += token;
            tokenCount++;

            const elapsedMs = Date.now() - requestStartTime;
            const tokensPerSecond = tokenCount / (elapsedMs / 1000);

            const streamChunk: TokenStreamChunk = {
              token,
              tokenId: tokenCount,
              isFirst: tokenCount === 1,
              isLast: false,
              ...(ttfbMs !== undefined && tokenCount === 1 && { ttfbMs }),
              tokensPerSecond
            };

            yield streamChunk;
          }

          // Handle tool input deltas
          if (delta.type === 'input_json_delta' && toolCalls) {
            const blockIndex = chunk.index;
            if (blockIndex !== undefined && toolCalls[blockIndex]) {
              // Accumulate JSON string and parse at the end
              const existing = toolCalls[blockIndex].function.arguments;
              const existingStr = typeof existing === 'string' ? existing : JSON.stringify(existing);
              const newStr = existingStr + delta.partial_json;
              toolCalls[blockIndex].function.arguments = newStr as any;
            }
          }
        } else if (chunk.type === 'content_block_stop') {
          // Parse accumulated tool arguments
          if (toolCalls) {
            const blockIndex = chunk.index;
            if (blockIndex !== undefined && toolCalls[blockIndex]) {
              const args = toolCalls[blockIndex].function.arguments;
              if (typeof args === 'string') {
                try {
                  toolCalls[blockIndex].function.arguments = JSON.parse(args);
                } catch (e) {
                  // If parsing fails, keep as empty object
                  toolCalls[blockIndex].function.arguments = {};
                }
              }
            }
          }
        } else if (chunk.type === 'message_delta') {
          // Capture finish reason
          if (chunk.delta.stop_reason) {
            finishReason = chunk.delta.stop_reason;
          }

          // Update usage with completion tokens
          if (chunk.usage) {
            if (!usage) {
              usage = {
                prompt_tokens: 0,
                completion_tokens: chunk.usage.output_tokens,
                total_tokens: chunk.usage.output_tokens
              };
            } else {
              usage.completion_tokens = chunk.usage.output_tokens;
              usage.total_tokens = usage.prompt_tokens + chunk.usage.output_tokens;
            }
          }
        }
      }

      // Yield final chunk
      const elapsedMs = Date.now() - requestStartTime;
      const tokensPerSecond = tokenCount / (elapsedMs / 1000);

      yield {
        token: '',
        tokenId: tokenCount + 1,
        isFirst: false,
        isLast: true,
        tokensPerSecond
      };

      // Set metadata
      const metadata: GenerationMetadata = {
        model: this.config.model,
        ...(usage && { usage }),
        finish_reason: finishReason as any,
        ...(ttfbMs !== undefined && { ttfbMs })
      };
      this.setMetadata(metadata);

      // Emit request complete event
      const completeEvent: any = {
        type: 'provider:request:complete',
        provider: 'anthropic',
        model: this.config.model,
        duration: Date.now() - requestStartTime,
        timestamp: Date.now()
      };
      if (usage) {
        completeEvent.usage = usage;
      }
      this.events.emit(completeEvent);

      logger.anthropicProvider.debug('Generation completed', {
        model: this.config.model,
        requestId,
        tokenCount,
        usage,
        finishReason,
        hadThinking: thinkingContent.length > 0,
        duration: Date.now() - requestStartTime
      });

    } catch (error: any) {
      // Handle rate limiting
      if (error.status === 429) {
        const retryAfter = error.headers?.['retry-after'];
        const rateLimitEvent: any = {
          type: 'provider:rate_limit',
          provider: 'anthropic',
          model: this.config.model,
          timestamp: Date.now()
        };
        if (retryAfter) {
          rateLimitEvent.retryAfter = parseInt(retryAfter);
        }
        this.events.emit(rateLimitEvent);
      }

      this.events.emit({
        type: 'provider:error',
        provider: 'anthropic',
        model: this.config.model,
        error,
        timestamp: Date.now()
      });

      logger.anthropicProvider.error('Generation failed', {
        model: this.config.model,
        requestId,
        error: error.message,
        status: error.status
      });

      throw error;
    }
  }

  /**
   * Dispose of the Anthropic provider
   */
  async dispose(): Promise<void> {
    if (this._disposed) {
      return;
    }

    logger.anthropicProvider.info('Disposing AnthropicProvider', {
      model: this.config.model
    });

    this.client = null;
    this._disposed = true;
  }

  /**
   * Convert internal message format to Anthropic format
   * Separates system messages from conversation messages
   */
  private convertMessages(messages: Message[]): { system?: string; messages: Anthropic.MessageParam[] } {
    let systemPrompt: string | undefined;
    const conversationMessages: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      // Extract system message
      if (msg.role === 'system') {
        // Anthropic expects system as a separate parameter, not in messages array
        systemPrompt = msg.content;
        continue;
      }

      // Handle user messages
      if (msg.role === 'user') {
        conversationMessages.push({
          role: 'user',
          content: msg.content
        });
        continue;
      }

      // Handle assistant messages with tool calls
      if (msg.role === 'assistant' && msg.tool_calls) {
        const content: Array<Anthropic.TextBlock | Anthropic.ToolUseBlock> = [];

        // Add text content if present
        if (msg.content) {
          content.push({
            type: 'text',
            text: msg.content
          } as Anthropic.TextBlock);
        }

        // Add tool use blocks
        for (const tc of msg.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: tc.function.arguments
          } as Anthropic.ToolUseBlock);
        }

        conversationMessages.push({
          role: 'assistant',
          content: content as any
        });
        continue;
      }

      // Handle assistant messages without tool calls
      if (msg.role === 'assistant') {
        conversationMessages.push({
          role: 'assistant',
          content: msg.content
        });
        continue;
      }

      // Handle tool result messages
      if (msg.role === 'tool' && msg.tool_call_id) {
        conversationMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.tool_call_id,
              content: msg.content
            }
          ]
        });
        continue;
      }

      // Fallback to user message
      conversationMessages.push({
        role: 'user',
        content: msg.content
      });
    }

    const result: { system?: string; messages: Anthropic.MessageParam[] } = {
      messages: conversationMessages
    };

    if (systemPrompt !== undefined) {
      result.system = systemPrompt;
    }

    return result;
  }

  /**
   * Convert internal tool format to Anthropic format
   */
  private convertTools(tools: Tool[]): Anthropic.Tool[] {
    return tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description || '',
      input_schema: tool.function.parameters as Anthropic.Tool.InputSchema
    }));
  }
}
