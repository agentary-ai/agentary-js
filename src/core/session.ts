import { type Session, type TokenStreamChunk } from '../types/session';
import { GenerateArgs } from '../types/worker';
import { InferenceProviderManager } from '../providers/manager';
import { logger } from '../utils/logger';
import { EventEmitter } from '../utils/event-emitter';
import { EventHandler, UnsubscribeFn } from '../types/events';
import { InferenceProviderConfig } from '../types/provider';
import { CreateSessionArgs } from '../types/session';

/**
 * Creates a new session with the specified configuration.
 * @param args - The configuration for the session.
 * @returns A new session.
 */
export async function createSession(args: CreateSessionArgs): Promise<Session> {
  const eventEmitter = new EventEmitter();
  const inferenceProviderManager = new InferenceProviderManager(eventEmitter);

  if (args.models) {
    await inferenceProviderManager.registerModels(args.models);
  }

  let disposed = false;

  async function registerModels(models: Record<string, InferenceProviderConfig>): Promise<void> {
    await inferenceProviderManager.registerModels(models);
  }

  async function* createResponse(args: GenerateArgs): AsyncIterable<TokenStreamChunk> {
    if (disposed) throw new Error('Session disposed');
    if (!args.model) {
      throw new Error('Model is undefined');
    }
    if (!args.messages) {
      throw new Error('Messages are undefined');
    }
    
    // Remove implementation field from tools before passing to provider
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

  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    await inferenceProviderManager.disposeAll();
    eventEmitter.removeAllListeners();
  }

  function on(eventType: string | '*', handler: EventHandler): UnsubscribeFn {
    return eventEmitter.on(eventType, handler);
  }

  function off(eventType: string | '*', handler: EventHandler): void {
    eventEmitter.off(eventType, handler);
  }

  const session: Session = {
    registerModels,
    createResponse,
    dispose,
    on,
    off,
    // Internal access to event emitter and provider manager for workflow components
    _eventEmitter: eventEmitter,
    _providerManager: inferenceProviderManager
  } as Session & { _eventEmitter: EventEmitter; _providerManager: InferenceProviderManager };

  return session;
}


