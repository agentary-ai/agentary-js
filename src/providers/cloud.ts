import type { GenerateArgs } from '../types/worker';
import type { ModelResponse, TokenStreamChunk } from '../types/session';
import {
  CloudProviderConfig,
  InferenceProvider,
  ProviderError,
  ProviderNetworkError,
  ProviderTimeoutError,
  ProviderAPIError,
  ProviderConfigurationError
} from '../types/provider';
import { EventEmitter } from '../utils/event-emitter';
import { logger } from '../utils/logger';
import { transformMessagesToProvider } from './message-transformer';

/**
 * Cloud-based inference provider using HTTP proxy
 *
 * This provider forwards inference requests to a user-controlled proxy endpoint,
 * which handles API keys and communicates with cloud LLM providers.
 *
 * Expected proxy contract:
 * - Request: POST to proxyUrl with JSON body containing GenerateArgs
 * 
 * Streaming Response (Content-Type: text/event-stream):
 * - Server-Sent Events (SSE) stream with chunks
 * - Each SSE event should be formatted as: data: {JSON}\n\n
 * - Expected JSON format: { token: string, tokenId?: number, isFirst?: boolean, isLast?: boolean }
 * 
 * Non-Streaming Response (Content-Type: application/json):
 * - Complete JSON response with full content
 * - Supports OpenAI-style format: { choices: [{ message: { content: string } }] }
 * - Also supports custom format: { token: string, tokenId?: number }
 */
export class CloudProvider implements InferenceProvider {
  private readonly config: CloudProviderConfig;
  private eventEmitter: EventEmitter;
  private initialized: boolean = false;
  private abortController: AbortController | undefined;

  constructor(
    config: CloudProviderConfig,
    eventEmitter: EventEmitter
  ) {
    this.config = config;
    this.eventEmitter = eventEmitter;
    this.validateConfig();
  }

  /**
   * Validates the configuration for the cloud provider
   */
  private validateConfig(): void {
    if (!this.config.proxyUrl) {
      throw new ProviderConfigurationError('proxyUrl is required for cloud provider');
    }
    if (!this.config.model) {
      throw new ProviderConfigurationError('model is required for cloud provider');
    }
  }

  /**
   * Initializes the provider. For cloud providers, this performs basic
   * validation and marks the provider as ready to use.
   * 
   * @returns A promise that resolves when the provider is initialized
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const initStartTime = Date.now();

    logger.cloudProvider?.info('Initializing cloud provider', {
      model: this.config.model,
      proxyUrl: this.config.proxyUrl
    });

    // For cloud providers, we can optionally validate connectivity
    // For now, we'll just mark as initialized
    this.initialized = true;

    this.eventEmitter.emit({
      type: 'worker:init:complete',
      modelName: this.config.model,
      duration: Date.now() - initStartTime,
      timestamp: Date.now()
    });

    logger.cloudProvider?.info('Cloud provider initialized', {
      model: this.config.model,
      duration: Date.now() - initStartTime
    });
  }

  /**
   * Generates a response for the given arguments.
   * 
   * @param args - The generation arguments
   * @returns A promise that resolves to the model response
   */
  async generate(args: GenerateArgs): Promise<ModelResponse> {
    if (!this.initialized) {
      throw new ProviderError(
        'Provider not initialized. Call initialize() first.',
        'UNINITIALIZED',
        400
      );
    }

    const timeout = this.config.timeout || 60000;
    const maxRetries = this.config.maxRetries || 3;
    let lastError: Error | null = null;

    // Retry logic with exponential backoff
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 1s, 2s, 4s, etc.
          const delay = Math.pow(2, attempt) * 1000;
          logger.cloudProvider?.info(`Retrying request (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms`, {
            model: this.config.model
          });
          await this.sleep(delay);
        }

        return await this.performRequest(args, timeout);
      } catch (error: any) {
        lastError = error;

        // Don't retry on certain errors
        if (
          error instanceof ProviderConfigurationError ||
          error instanceof ProviderTimeoutError ||
          (error instanceof ProviderAPIError && error.statusCode && error.statusCode < 500)
        ) {
          throw error;
        }

        logger.cloudProvider?.warn('Request failed, will retry', {
          model: this.config.model,
          attempt: attempt + 1,
          error: error.message
        });
      }
    }

    // All retries exhausted
    throw lastError || new ProviderError('Request failed after all retries', 'MAX_RETRIES_EXCEEDED', 500);
  }

  /**
   * Performs the actual HTTP request to the cloud provider proxy
   */
  private async performRequest(
    args: GenerateArgs,
    timeout: number
  ): Promise<ModelResponse> {
    this.abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, timeout);

    const startTime = Date.now();

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...this.config.headers
      };

      logger.cloudProvider?.info('Sending request to proxy', {
        model: this.config.model,
        proxyUrl: this.config.proxyUrl,
        modelProvider: this.config.modelProvider
      });

      // Transform messages based on model provider
      const messagesToSend = this.config.modelProvider
        ? transformMessagesToProvider(args.messages, this.config.modelProvider)
        : args.messages;

      const response = await fetch(this.config.proxyUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.config.model,
          ...args,
          messages: messagesToSend,
        }),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new ProviderAPIError(
          `Proxy returned error: ${response.status} ${response.statusText} - ${errorText}`,
          response.status,
          `HTTP_${response.status}`
        );
      }

      // Detect response type based on Content-Type header
      const contentType = response.headers.get('Content-Type') || '';
      const isStreaming = contentType.includes('text/event-stream');

      // Check if non-streaming is requested
      if (args.stream === false) {
        // Aggregate chunks into complete response
        let fullContent = '';
        let tokenCount = 0;

        const stream = isStreaming
          ? this.handleStreamingResponse(response, startTime)
          : this.handleNonStreamingResponse(response, startTime);

        for await (const chunk of stream) {
          if (!chunk.isLast) {
            fullContent += chunk.token;
            tokenCount++;
          }
        }

        return {
          type: 'complete',
          content: fullContent,
          usage: {
            promptTokens: 0,
            completionTokens: tokenCount,
            totalTokens: tokenCount
          }
        };
      }

      // Return streaming response (default)
      const stream = isStreaming
        ? this.handleStreamingResponse(response, startTime)
        : this.handleNonStreamingResponse(response, startTime);

      return {
        type: 'streaming',
        stream
      };

    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new ProviderTimeoutError(timeout);
      }

      if (error instanceof ProviderError) {
        throw error;
      }

      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new ProviderNetworkError(error);
      }

      throw new ProviderError(
        `Unexpected error: ${error.message}`,
        'UNKNOWN_ERROR',
        500
      );
    } finally {
      clearTimeout(timeoutId);
      this.abortController = undefined;
    }
  }

  /**
   * Handle SSE streaming responses
   */
  private async *handleStreamingResponse(
    response: Response,
    startTime: number
  ): AsyncIterable<TokenStreamChunk> {
    if (!response.body) {
      throw new ProviderError('Response body is null', 'NO_RESPONSE_BODY', 500);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let tokenCount = 0;
    let firstTokenTime: number | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();

            // Handle [DONE] signal (OpenAI convention)
            if (data === '[DONE]') {
              continue;
            }

            try {
              const chunk = JSON.parse(data);

              // Mark first token time for TTFB calculation
              if (tokenCount === 0) {
                firstTokenTime = Date.now();
              }

              const tokenChunk: TokenStreamChunk = {
                token: chunk.token || '',
                tokenId: chunk.tokenId ?? tokenCount,
                isFirst: tokenCount === 0,
                isLast: chunk.isLast ?? false,
                ...(tokenCount === 0 && firstTokenTime ? { ttfbMs: firstTokenTime - startTime } : {})
              };

              tokenCount++;
              yield tokenChunk;

              // If marked as last, we're done
              if (tokenChunk.isLast) {
                return;
              }
            } catch (parseError: any) {
              logger.cloudProvider?.warn('Failed to parse SSE data', {
                model: this.config.model,
                data,
                error: parseError.message
              });
            }
          } else if (line.startsWith('error: ')) {
            const errorData = line.slice(7).trim();
            try {
              const errorObj = JSON.parse(errorData);
              throw new ProviderAPIError(
                errorObj.message || 'Unknown API error',
                errorObj.statusCode || 500,
                errorObj.code
              );
            } catch {
              throw new ProviderAPIError(errorData, 500);
            }
          }
        }
      }

      // If we got here without seeing isLast, mark the last token we got as last
      if (tokenCount === 0) {
        throw new ProviderError('No tokens received from provider', 'NO_TOKENS', 500);
      }

    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Handle non-streaming JSON responses
   */
  private async *handleNonStreamingResponse(
    response: Response,
    startTime: number
  ): AsyncIterable<TokenStreamChunk> {
    const data = await response.json();
    const firstTokenTime = Date.now();

    logger.cloudProvider?.debug('Received non-streaming response', {
      model: this.config.model,
      hasChoices: !!data.choices,
      hasContent: !!(data.choices?.[0]?.message?.content)
    });

    // Handle different provider response formats
    let content = '';
    
    switch (this.config.modelProvider) {
      case 'openai':
        content = data.choices?.[0]?.message?.content || '';
        break;
      case 'anthropic':
        content = data.content?.[0]?.text || '';
        break;
      default:
        // Generic format fallback
        content = data.content || data.message || data.text || '';
        break;
    }

    if (!content) {
      logger.cloudProvider?.error('Unexpected response format', {
        model: this.config.model,
        responseKeys: Object.keys(data)
      });
      throw new ProviderError('Unexpected non-streaming response format', 'INVALID_RESPONSE_FORMAT', 500);
    }

    // Yield the complete content as a single chunk
    yield {
      token: content,
      tokenId: 0,
      isFirst: true,
      isLast: true,
      ttfbMs: firstTokenTime - startTime
    };
  }

  /**
   * Disposes the provider and cleans up resources.
   */
  async dispose(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    logger.cloudProvider?.info('Disposing cloud provider', {
      model: this.config.model
    });

    // Abort any in-flight requests
    this.abortController?.abort();
    this.initialized = false;

    this.eventEmitter.emit({
      type: 'worker:disposed',
      modelName: this.config.model,
      timestamp: Date.now()
    });

    logger.cloudProvider?.info('Cloud provider disposed', {
      model: this.config.model
    });
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getModelName(): string {
    return this.config.model;
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
