import { type CreateSessionArgs, type Session, type TokenStreamChunk, type GenerationTask } from '../types/session';
import { GenerateArgs } from '../types/worker';
import { ProviderManager } from '../providers/provider-manager';
import { WorkerManager } from '../workers/manager';
import { logger } from '../utils/logger';
import { EventEmitter } from '../utils/event-emitter';
import { EventHandler, UnsubscribeFn } from '../types/events';

/**
 * Creates a new session with the specified configuration.
 * @param args - The configuration for the session.
 * @returns A new session.
 */
export async function createSession(args: CreateSessionArgs = {}): Promise<Session> {
  const eventEmitter = new EventEmitter();
  const providerManager = new ProviderManager(args, eventEmitter);

  // Keep workerManager for backward compatibility
  const workerManager = new WorkerManager(args, eventEmitter);

  let disposed = false;
  let requestCounter = 0;

  async function* createResponse(args: GenerateArgs, generationTask?: GenerationTask): AsyncIterable<TokenStreamChunk> {
    if (disposed) throw new Error('Session disposed');

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

    // Default to tool use if no generation task is specified and tools are provided
    if (!generationTask && args.tools && args.tools.length > 0) {
      generationTask = 'tool_use';
    }

    // Get provider for this generation task
    const provider = await providerManager.getProvider(args, generationTask);
    const requestId = String(++requestCounter);

    const startTime = Date.now();
    let tokenCount = 0;
    let modelName = 'unknown';

    // Get model name from provider config
    if (provider.config.type === 'local') {
      modelName = provider.config.model.name;
    } else {
      modelName = provider.config.model || 'unknown';
    }

    // Emit generation start event
    eventEmitter.emit({
      type: 'generation:start',
      requestId,
      modelName,
      messageCount: args.messages.length,
      timestamp: startTime
    });

    logger.session.debug('Starting generation', {
      requestId,
      modelName,
      generationTask,
      messageCount: args.messages.length
    });

    try {
      // Stream tokens from provider
      for await (const chunk of provider.generate(args)) {
        if (!chunk.isLast) {
          tokenCount++;
        }

        // Emit token event
        const tokenEvent: any = {
          type: 'generation:token',
          requestId,
          token: chunk.token,
          tokenId: chunk.tokenId,
          isFirst: chunk.isFirst,
          isLast: chunk.isLast,
          timestamp: Date.now()
        };
        if (chunk.ttfbMs !== undefined) {
          tokenEvent.ttfbMs = chunk.ttfbMs;
        }
        eventEmitter.emit(tokenEvent);

        yield chunk;
      }

      // Emit completion event
      const duration = Date.now() - startTime;
      eventEmitter.emit({
        type: 'generation:complete',
        requestId,
        totalTokens: tokenCount,
        duration,
        tokensPerSecond: tokenCount / (duration / 1000),
        timestamp: Date.now()
      });

      logger.session.debug('Generation completed', {
        requestId,
        totalTokens: tokenCount,
        duration
      });

    } catch (error: any) {
      logger.session.error('Generation error', error.message, requestId);

      // Emit error event
      eventEmitter.emit({
        type: 'generation:error',
        requestId,
        error: error.message,
        timestamp: Date.now()
      });

      throw error;
    }
  }

  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    await providerManager.disposeAll();
    eventEmitter.removeAllListeners();
  }

  function on(eventType: string | '*', handler: EventHandler): UnsubscribeFn {
    return eventEmitter.on(eventType, handler);
  }

  function off(eventType: string | '*', handler: EventHandler): void {
    eventEmitter.off(eventType, handler);
  }

  const session: Session = {
    createResponse,
    dispose,
    workerManager,
    on,
    off,
    // Internal access to event emitter for workflow components
    _eventEmitter: eventEmitter
  } as Session & { _eventEmitter: EventEmitter };
  return session;
}


