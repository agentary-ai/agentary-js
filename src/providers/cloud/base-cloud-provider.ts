// import type { InferenceProvider, ProviderType, CloudProviderConfig } from '../base';
// import type { GenerateArgs, Model } from '../../types/worker';
// import type { GenerationTask, TokenStreamChunk } from '../../types/session';
// import {
//   ProviderError,
//   ProviderNetworkError,
//   ProviderTimeoutError,
//   ProviderAPIError,
//   ProviderConfigurationError
// } from '../base';
// import { EventEmitter } from '../../utils/event-emitter';
// import { logger } from '../../utils/logger';

// /**
//  * Base class for cloud-based inference providers
//  */
// export abstract class BaseCloudProvider implements InferenceProvider {
//   protected readonly model: Model;
//   protected readonly config: CloudProviderConfig;
//   protected readonly eventEmitter: EventEmitter;
//   protected initialized: boolean = false;

//   constructor(
//     model: Model,
//     config: CloudProviderConfig,
//     eventEmitter: EventEmitter
//   ) {
//     this.model = model;
//     this.config = {
//       timeout: 60000,
//       maxRetries: 3,
//       ...config
//     };
//     this.eventEmitter = eventEmitter;

//     // Validate configuration
//     if (!config.proxyUrl) {
//       throw new ProviderConfigurationError(
//         this.getProviderType(),
//         'proxyUrl is required for cloud providers'
//       );
//     }
//   }

//   async initialize(): Promise<void> {
//     logger.cloudProvider?.info('Initializing cloud provider', {
//       provider: this.getProviderType(),
//       model: this.model.name,
//       proxyUrl: this.config.proxyUrl
//     });

//     this.initialized = true;

//     this.eventEmitter.emit({
//       type: 'provider:init:complete',
//       providerType: this.getProviderType(),
//       modelName: this.getModelName(),
//       timestamp: Date.now()
//     });
//   }

//   abstract generate(
//     args: GenerateArgs,
//     generationTask?: GenerationTask
//   ): AsyncIterable<TokenStreamChunk>;

//   async dispose(): Promise<void> {
//     logger.cloudProvider?.info('Disposing cloud provider', {
//       provider: this.getProviderType(),
//       model: this.model.name
//     });

//     this.initialized = false;

//     this.eventEmitter.emit({
//       type: 'provider:disposed',
//       providerType: this.getProviderType(),
//       modelName: this.getModelName(),
//       timestamp: Date.now()
//     });
//   }

//   isInitialized(): boolean {
//     return this.initialized;
//   }

//   abstract getProviderType(): ProviderType;

//   getModelName(): string {
//     return this.config.model || this.model.name;
//   }

//   /**
//    * Make an HTTP request to the proxy with retry logic
//    */
//   protected async fetchWithRetry(
//     url: string,
//     options: RequestInit,
//     attempt: number = 1
//   ): Promise<Response> {
//     const maxRetries = this.config.maxRetries || 3;
//     const timeout = this.config.timeout || 60000;

//     try {
//       // Create abort controller for timeout
//       const controller = new AbortController();
//       const timeoutId = setTimeout(() => controller.abort(), timeout);

//       const response = await fetch(url, {
//         ...options,
//         signal: controller.signal,
//         headers: {
//           'Content-Type': 'application/json',
//           ...this.config.headers,
//           ...options.headers,
//         },
//       });

//       clearTimeout(timeoutId);

//       // Handle HTTP errors
//       if (!response.ok) {
//         const errorBody = await response.text().catch(() => 'Unknown error');

//         // Check if we should retry (5xx errors or rate limits)
//         const shouldRetry =
//           (response.status >= 500 || response.status === 429) &&
//           attempt < maxRetries;

//         if (shouldRetry) {
//           // Exponential backoff
//           const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
//           logger.cloudProvider?.warn('Retrying request', {
//             attempt,
//             maxRetries,
//             delay,
//             status: response.status
//           });
//           await new Promise(resolve => setTimeout(resolve, delay));
//           return this.fetchWithRetry(url, options, attempt + 1);
//         }

//         throw new ProviderAPIError(
//           this.getProviderType(),
//           `HTTP ${response.status}: ${errorBody}`,
//           response.status,
//           response.statusText
//         );
//       }

//       return response;
//     } catch (error: any) {
//       // Handle timeout
//       if (error.name === 'AbortError') {
//         throw new ProviderTimeoutError(this.getProviderType(), timeout);
//       }

//       // Handle network errors with retry
//       if (error instanceof TypeError && attempt < maxRetries) {
//         const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
//         logger.cloudProvider?.warn('Network error, retrying', {
//           attempt,
//           maxRetries,
//           delay,
//           error: error.message
//         });
//         await new Promise(resolve => setTimeout(resolve, delay));
//         return this.fetchWithRetry(url, options, attempt + 1);
//       }

//       // Rethrow provider errors as-is
//       if (error instanceof ProviderError) {
//         throw error;
//       }

//       // Wrap other errors
//       throw new ProviderNetworkError(this.getProviderType(), error);
//     }
//   }

//   /**
//    * Parse Server-Sent Events (SSE) stream
//    */
//   protected async *parseSSEStream(
//     response: Response
//   ): AsyncIterable<any> {
//     if (!response.body) {
//       throw new ProviderError(
//         'Response body is null',
//         this.getProviderType(),
//         'NO_RESPONSE_BODY'
//       );
//     }

//     const reader = response.body.getReader();
//     const decoder = new TextDecoder();
//     let buffer = '';

//     try {
//       while (true) {
//         const { done, value } = await reader.read();

//         if (done) {
//           break;
//         }

//         buffer += decoder.decode(value, { stream: true });
//         const lines = buffer.split('\n');

//         // Keep the last incomplete line in the buffer
//         buffer = lines.pop() || '';

//         for (const line of lines) {
//           const trimmed = line.trim();

//           // Skip empty lines and comments
//           if (!trimmed || trimmed.startsWith(':')) {
//             continue;
//           }

//           // Parse SSE data field
//           if (trimmed.startsWith('data: ')) {
//             const data = trimmed.slice(6);

//             // Check for stream end marker
//             if (data === '[DONE]') {
//               return;
//             }

//             try {
//               const parsed = JSON.parse(data);
//               yield parsed;
//             } catch (e) {
//               logger.cloudProvider?.warn('Failed to parse SSE data', {
//                 data,
//                 error: e
//               });
//             }
//           }
//         }
//       }
//     } finally {
//       reader.releaseLock();
//     }
//   }

//   /**
//    * Convert provider-specific response to TokenStreamChunk
//    * Must be implemented by each provider
//    */
//   protected abstract convertToTokenChunk(
//     data: any,
//     isFirst: boolean
//   ): TokenStreamChunk | null;

//   /**
//    * Build the request body for the provider's API
//    * Must be implemented by each provider
//    */
//   protected abstract buildRequestBody(args: GenerateArgs): any;

//   /**
//    * Helper to stream tokens from SSE response
//    */
//   protected async *streamTokens(
//     response: Response,
//     startTime: number
//   ): AsyncIterable<TokenStreamChunk> {
//     let isFirst = true;
//     let tokenCount = 0;

//     for await (const data of this.parseSSEStream(response)) {
//       const chunk = this.convertToTokenChunk(data, isFirst);

//       if (chunk) {
//         tokenCount++;

//         // Add TTFB for first token
//         if (isFirst) {
//           chunk.ttfbMs = Date.now() - startTime;
//           isFirst = false;
//         }

//         // Calculate tokens per second
//         if (tokenCount > 1) {
//           const elapsed = (Date.now() - startTime) / 1000;
//           chunk.tokensPerSecond = tokenCount / elapsed;
//         }

//         yield chunk;
//       }
//     }
//   }
// }
