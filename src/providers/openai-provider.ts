import OpenAI from 'openai';
import { BaseProvider } from './base-provider';
import { OpenAIProviderConfig, GenerationMetadata, TokenUsage } from '../types/provider';
import { GenerateArgs, Message, Tool, ToolCall } from '../types/worker';
import { TokenStreamChunk } from '../types/session';
import { logger } from '../utils/logger';
import { ResponseCreateParamsBase, ResponseInput } from 'openai/resources/responses/responses.mjs';


/**
 * OpenAI API provider
 * Supports streaming, tool calling, and token usage tracking
 */
export class OpenAIProvider extends BaseProvider {
  declare config: OpenAIProviderConfig;
  private client: OpenAI | null = null;
  private requestCounter = 0;

  constructor(config: OpenAIProviderConfig) {
    super(config);
  }

  /**
   * Initialize the OpenAI provider
   * Validates API key and creates client instance
   */
  async initialize(): Promise<void> {
    this.assertNotDisposed();

    if (this._initialized) {
      logger.openaiProvider.debug('OpenAIProvider already initialized');
      return;
    }

    logger.openaiProvider.info('Initializing OpenAIProvider', {
      model: this.config.model,
      baseURL: this.config.baseURL
    });

    const initStartTime = Date.now();

    // Emit init start event
    this.events.emit({
      type: 'provider:init:start',
      provider: 'openai',
      model: this.config.model,
      timestamp: initStartTime
    });

    try {
      // Create OpenAI client
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
        organization: this.config.organization,
        maxRetries: this.config.maxRetries ?? 2,
        dangerouslyAllowBrowser: true // Allow browser usage
      });

      this._initialized = true;

      // Emit init complete event
      this.events.emit({
        type: 'provider:init:complete',
        provider: 'openai',
        model: this.config.model,
        duration: Date.now() - initStartTime,
        timestamp: Date.now()
      });

      logger.openaiProvider.info('OpenAIProvider initialized successfully', {
        model: this.config.model,
        duration: Date.now() - initStartTime
      });
    } catch (error: any) {
      this.events.emit({
        type: 'provider:error',
        provider: 'openai',
        model: this.config.model,
        error,
        timestamp: Date.now()
      });

      logger.openaiProvider.error('OpenAIProvider initialization failed', {
        model: this.config.model,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Generate a response stream using OpenAI API
   */
  async *generate(args: GenerateArgs): AsyncIterable<TokenStreamChunk> {
    this.assertReady();

    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const requestId = String(++this.requestCounter);
    const requestStartTime = Date.now();

    // Clear previous metadata
    this.clearMetadata();

    // Emit request start event
    this.events.emit({
      type: 'provider:request:start',
      provider: 'openai',
      model: this.config.model,
      timestamp: requestStartTime
    });

    logger.openaiProvider.debug('Starting generation', {
      model: this.config.model,
      requestId,
      messageCount: args.messages.length,
      hasTools: !!args.tools && args.tools.length > 0
    });

    try {
      // Convert messages to OpenAI format
      const messages = this.convertMessages(args.messages);

      // Convert tools to OpenAI format
      const tools = args.tools && args.tools.length > 0
        ? this.convertTools(args.tools)
        : undefined;

      // Create streaming request
      const requestParams: ResponseCreateParamsBase = {
        model: this.config.model,
        input: messages,
        stream: true
      };

      if (tools) requestParams.tools = tools;
      if (args.max_new_tokens !== undefined) requestParams.max_output_tokens = args.max_new_tokens;
      if (args.temperature !== undefined) requestParams.temperature = args.temperature;
      if (args.top_p !== undefined) requestParams.top_p = args.top_p;
      // Note: stop and seed are not supported in the Responses API

      const response = await this.client.responses.create(requestParams);
      const stream = response as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

      let fullContent = '';
      let tokenCount = 0;
      let ttfbMs: number | undefined;
      let usage: TokenUsage | undefined;
      let finishReason: string | undefined;
      let toolCalls: ToolCall[] | undefined;

      // Stream tokens
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const finish = chunk.choices[0]?.finish_reason;

        // Capture TTFB on first chunk
        if (tokenCount === 0 && delta?.content) {
          ttfbMs = Date.now() - requestStartTime;
        }

        // Handle content tokens
        if (delta?.content) {
          const token = delta.content;
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

        // Handle tool calls
        if (delta?.tool_calls) {
          if (!toolCalls) {
            toolCalls = [];
          }
          // Accumulate tool calls (OpenAI streams them incrementally)
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index;
            if (index !== undefined) {
              if (!toolCalls[index]) {
                toolCalls[index] = {
                  id: '',
                  type: 'function',
                  function: {
                    name: '',
                    arguments: {}
                  }
                };
              }
              if (toolCall.id) {
                toolCalls[index].id = toolCall.id;
              }
              if (toolCall.function) {
                if (toolCall.function.name) {
                  toolCalls[index].function.name = toolCall.function.name;
                }
                if (toolCall.function.arguments) {
                  const existing = JSON.stringify(toolCalls[index].function.arguments);
                  const merged = existing === '{}'
                    ? toolCall.function.arguments
                    : existing.slice(0, -1) + toolCall.function.arguments.slice(1);
                  toolCalls[index].function.arguments = JSON.parse(merged);
                }
              }
            }
          }
        }

        // Capture finish reason and usage
        if (finish) {
          finishReason = finish;
        }

        // OpenAI includes usage in the last chunk
        if (chunk.usage) {
          usage = {
            prompt_tokens: chunk.usage.prompt_tokens,
            completion_tokens: chunk.usage.completion_tokens,
            total_tokens: chunk.usage.total_tokens
          };
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
        provider: 'openai',
        model: this.config.model,
        duration: Date.now() - requestStartTime,
        timestamp: Date.now()
      };
      if (usage) {
        completeEvent.usage = usage;
      }
      this.events.emit(completeEvent);

      logger.openaiProvider.debug('Generation completed', {
        model: this.config.model,
        requestId,
        tokenCount,
        usage,
        finishReason,
        duration: Date.now() - requestStartTime
      });

    } catch (error: any) {
      // Handle rate limiting
      if (error.status === 429) {
        const retryAfter = error.headers?.['retry-after'];
        const rateLimitEvent: any = {
          type: 'provider:rate_limit',
          provider: 'openai',
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
        provider: 'openai',
        model: this.config.model,
        error,
        timestamp: Date.now()
      });

      logger.openaiProvider.error('Generation failed', {
        model: this.config.model,
        requestId,
        error: error.message,
        status: error.status
      });

      throw error;
    }
  }

  /**
   * Dispose of the OpenAI provider
   */
  async dispose(): Promise<void> {
    if (this._disposed) {
      return;
    }

    logger.openaiProvider.info('Disposing OpenAIProvider', {
      model: this.config.model
    });

    this.client = null;
    this._disposed = true;
  }

  /**
   * Convert internal message format to OpenAI Responses API format
   */
  private convertMessages(messages: Message[]): ResponseInput {
    const result: ResponseInput = [];

    for (const msg of messages) {
      // Handle system messages
      if (msg.role === 'system') {
        result.push({
          type: 'message',
          role: 'system',
          content: msg.content
        } as any);
      }
      // Handle user messages
      else if (msg.role === 'user') {
        result.push({
          type: 'message',
          role: 'user',
          content: msg.content
        } as any);
      }
      // Handle assistant messages with tool calls
      else if (msg.role === 'assistant' && msg.tool_calls) {
        // Add assistant message
        result.push({
          type: 'message',
          role: 'assistant',
          content: msg.content || ''
        } as any);

        // Add tool calls as separate items
        for (const tc of msg.tool_calls) {
          result.push({
            type: 'function',
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.stringify(tc.function.arguments)
          } as any);
        }
      }
      // Handle assistant messages without tool calls
      else if (msg.role === 'assistant') {
        result.push({
          type: 'message',
          role: 'assistant',
          content: msg.content
        } as any);
      }
      // Handle tool result messages
      else if (msg.role === 'tool' && msg.tool_call_id) {
        result.push({
          type: 'function_call_output',
          call_id: msg.tool_call_id,
          output: msg.content
        } as any);
      }
      // Fallback
      else {
        result.push({
          type: 'message',
          role: 'user',
          content: msg.content
        } as any);
      }
    }

    return result;
  }

  /**
   * Convert internal tool format to OpenAI Responses API FunctionTool format
   */
  private convertTools(tools: Tool[]) {
    return tools.map(tool => ({
      type: 'function' as const,
      name: tool.function.name,
      description: tool.function.description || null,
      parameters: tool.function.parameters || null,
      strict: null
    }));
  }
}
