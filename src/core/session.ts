import { ModelConfig, type Session, type TokenStreamChunk } from '../types/session';
import { GenerateArgs } from '../types/worker';
import { InferenceProviderManager } from '../providers/manager';
import { logger } from '../utils/logger';
import { EventEmitter } from '../utils/event-emitter';
import { EventHandler, UnsubscribeFn } from '../types/events';
import { InferenceProviderConfig } from '../types/provider';
import { CreateSessionArgs } from '../types/session';

/**
 * Creates a new session for model inference with support for both on-device
 * and cloud-based LLM providers.
 * 
 * @param args - Configuration for the session
 * @param args.models - Optional record of models to register at initialization
 * @returns A Promise resolving to a fully configured Session instance
 */
export async function createSession(args: CreateSessionArgs): Promise<Session> {
  const eventEmitter = new EventEmitter();
  const inferenceProviderManager = new InferenceProviderManager(eventEmitter);

  // Register any models provided at initialization time
  if (args.models) {
    await inferenceProviderManager.registerModels(args.models);
  }

  let disposed = false;

  /**
   * Registers additional models with the session after creation.
   * 
   * @param models - Record mapping model names to their provider configurations
   * @returns Promise that resolves when all models are registered and ready for use
   */
  async function registerModels(models: ModelConfig[]): Promise<void> {
    await inferenceProviderManager.registerModels(models);
  }

  /**
   * Generates a streaming response from the LLM for the given prompt and configuration.
   * 
   * @param args - Generation arguments
   * @param args.model - Name of the model to use for generation (must be registered)
   * @param args.messages - Array of conversation messages
   * @param args.tools - Optional array of tools available for function calling
   * @param args.maxTokens - Optional maximum number of tokens to generate
   * @param args.temperature - Optional sampling temperature (0-1)
   * @param args.topP - Optional nucleus sampling parameter
   * 
   * @returns Async iterable yielding token chunks as they are generated
   * 
   * @throws {Error} If session is disposed
   * @throws {Error} If model is undefined
   * @throws {Error} If messages are undefined
   * @throws {Error} If model is not registered or initialization fails
   * 
   * @example
   * ```typescript
   * for await (const chunk of session.createResponse({ prompt: "Hello!" })) {
   *   console.log(chunk.token);
   * }
   * ```
   */
  async function* createResponse(args: GenerateArgs): AsyncIterable<TokenStreamChunk> {
    if (disposed) throw new Error('Session disposed');
    if (!args.model) throw new Error('Model is undefined');
    if (!args.messages) throw new Error('Messages are undefined');
    
    // Remove implementation field from tools before passing to provider
    // Cloud providers don't need the actual implementation, only the schema
    args = {
      ...args,
      ...(args.tools && args.tools.length > 0 ? {
        tools: args.tools.map(tool => {
          const { implementation, ...functionWithoutImpl } = tool.function;
          return {
            ...tool,
            function: functionWithoutImpl
          };
        })
      } : {})
    };

    try {
      // Get provider for generation
      const provider = await inferenceProviderManager.getProvider(args.model);

      const startTime = Date.now();
      let tokenCount = 0;

      // Emit generation start event
      eventEmitter.emit({
        type: 'generation:start',
        modelName: provider.getModelName(),
        messageCount: args.messages.length,
        timestamp: startTime
      });

      // Stream tokens from provider
      for await (const chunk of provider.generate(args)) {
        if (!chunk.isLast) {
          tokenCount++;
        }

      // Emit token event
      eventEmitter.emit({
        type: 'generation:token',
        token: chunk.token,
        tokenId: chunk.tokenId,
        isFirst: chunk.isFirst,
        isLast: chunk.isLast,
        ...(chunk.ttfbMs !== undefined && { ttfbMs: chunk.ttfbMs }),
        timestamp: Date.now()
      });

        yield chunk;
      }

      // Emit completion event
      const duration = Date.now() - startTime;
      eventEmitter.emit({
        type: 'generation:complete',
        totalTokens: tokenCount,
        duration,
        tokensPerSecond: tokenCount / (duration / 1000),
        timestamp: Date.now()
      });
    } catch (error: any) {
      logger.session?.error('Generation error', { error: error.message });

      // Emit error event
      eventEmitter.emit({
        type: 'generation:error',
        error: error.message,
        timestamp: Date.now()
      });

      throw error;
    }
  }

  /**
   * Disposes the session and releases all allocated resources.
   * 
   * @returns Promise that resolves when all cleanup is complete
   */
  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    await inferenceProviderManager.disposeAll();
    eventEmitter.removeAllListeners();
  }

  /**
   * Subscribes to session events for monitoring generation lifecycle.
   * 
   * Available event types:
   * - `generation:start` - Fired when generation begins
   * - `generation:token` - Fired for each generated token
   * - `generation:complete` - Fired when generation completes successfully
   * - `generation:error` - Fired when an error occurs during generation
   * - `*` - Wildcard to listen to all events
   * 
   * @param eventType - The specific event type to listen for, or '*' for all events
   * @param handler - Callback function invoked when the event occurs
   * @returns Unsubscribe function to remove this listener
   */
  function on(eventType: string | '*', handler: EventHandler): UnsubscribeFn {
    return eventEmitter.on(eventType, handler);
  }

  /**
   * Removes a previously registered event handler.
   * 
   * @param eventType - The event type the handler was registered for
   * @param handler - The exact handler function to remove (must be same reference)
   */
  function off(eventType: string | '*', handler: EventHandler): void {
    eventEmitter.off(eventType, handler);
  }

  // Assemble the session object with all public methods
  // Note: _eventEmitter and _providerManager are internal APIs used by AgentSession
  // and should not be used directly by external consumers
  const session: Session = {
    registerModels,
    createResponse,
    dispose,
    on,
    off,
    _eventEmitter: eventEmitter,
    _providerManager: inferenceProviderManager
  } as Session & { _eventEmitter: EventEmitter; _providerManager: InferenceProviderManager };

  return session;
}