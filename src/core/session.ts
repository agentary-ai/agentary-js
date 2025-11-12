import { ModelResponse, type Session, type TokenStreamChunk } from '../types/session';
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
  logger.session?.info('Creating session', { args });

  const eventEmitter = new EventEmitter();
  const inferenceProviderManager = new InferenceProviderManager(eventEmitter);

  // Register any models provided at initialization time
  if (args.models) await inferenceProviderManager.registerModels(args.models);

  let disposed = false;

  /**
   * Registers additional models with the session after creation.
   * 
   * @param models - Record mapping model names to their provider configurations
   * @returns Promise that resolves when all models are registered and ready for use
   */
  async function registerModels(models: InferenceProviderConfig[]): Promise<void> {
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
  async function createResponse(model: string, args: GenerateArgs): Promise<ModelResponse> {
    if (disposed) throw new Error('Session disposed');
    if (!model) throw new Error('Model is undefined');
    if (!args.messages) throw new Error('Messages are undefined');

    const startTime = Date.now();
  
    try {
      // Get provider for generation
      const provider = await inferenceProviderManager.getProvider(model);

      // Disable streaming for tool use
      if (args.tools) args.stream = false;
      
      logger.session?.debug('Generating response', { args });
      const generateResponse =await provider.generate(args);

      // TODO: Throw error if tool calling not supported by model
      
      if (generateResponse.type === 'streaming') {
        return {
          type: 'streaming',
          stream: wrapStreamWithEvents(
            generateResponse.stream, 
            provider.getModelName(), 
            startTime,
            args.messages.length
          )
        }
      } else {
        console.log('Complete response', generateResponse);
        if (args.tools && !generateResponse.toolCalls) {
          const errorMessage = 'Tool calls not found in response';
          logger.session?.error(errorMessage, {
            model,
            args,
            generateResponse,
            timestamp: Date.now()
          });
          throw new Error(errorMessage);
        }
          
        // Validate that all tools in response were in the original request
        if (args.tools && generateResponse.toolCalls) {
          const requestedToolNames = new Set(args.tools.map(tool => tool.name));
          const invalidTools = generateResponse.toolCalls.filter(
            toolCall => !requestedToolNames.has(toolCall.function.name)
          );
          
          if (invalidTools.length > 0) {
            const invalidToolNames = invalidTools.map(t => t.function.name).join(', ');
            const errorMessage = `Response contains tool(s) not in request: ${invalidToolNames}`;
            logger.session?.error(errorMessage, {
              model,
              requestedTools: Array.from(requestedToolNames),
              invalidTools: invalidTools.map(t => t.function.name),
              timestamp: Date.now()
            });
            throw new Error(errorMessage);
          }
        }
        
        return generateResponse;
      }
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
   * Wraps a stream with event emission for streaming responses.
   * 
   * @param stream - The stream to wrap
   * @param modelName - The name of the model
   * @param startTime - The start time of the generation
   * @returns An async iterable yielding token chunks with event emission
   */
  async function* wrapStreamWithEvents(
    stream: AsyncIterable<TokenStreamChunk>,
    modelName: string,
    startTime: number,
    messageCount: number
  ): AsyncIterable<TokenStreamChunk> {
    let tokenCount = 0;
    
    try {
      eventEmitter.emit({
        type: 'generation:start',
        modelName,
        messageCount,
        timestamp: startTime
      });
      
      for await (const chunk of stream) {
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
        
        // If this is the last chunk, emit complete event
        if (chunk.isLast) {
          const duration = Date.now() - startTime;
          eventEmitter.emit({
            type: 'generation:complete',
            totalTokens: tokenCount,
            duration,
            tokensPerSecond: tokenCount / (duration / 1000),
            timestamp: Date.now()
          });
        }
      }
    } catch (error: any) {
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
  const session: Session = {
    registerModels,
    createResponse,
    dispose,
    on,
    off,
  } as Session;

  return session;
}