import { type CreateSessionArgs, type Session, type TokenStreamChunk, type GenerationTask } from '../types/session';
import { GenerateArgs, WorkerInstance } from '../types/worker';
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
  const workerManager = new WorkerManager(args, eventEmitter);
  let disposed = false;

  function nextId(workerInstance: WorkerInstance): string { 
    workerInstance.inflightId += 1; 
    return String(workerInstance.inflightId); 
  }

  async function* createResponse(args: GenerateArgs, generationTask?: GenerationTask): AsyncIterable<TokenStreamChunk> {
    if (disposed) throw new Error('Session disposed');

    // Remove implementation field from tools before passing to worker
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

    // Retrieve worker for model generation
    const workerInstance = await workerManager.getWorker(args, generationTask);
    const requestId = nextId(workerInstance);

    const queue: TokenStreamChunk[] = [];
    let done = false;
    const startTime = Date.now();
    let tokenCount = 0;

    // Emit generation start event
    eventEmitter.emit({
      type: 'generation:start',
      requestId,
      modelName: workerInstance.model.name,
      messageCount: args.messages.length,
      timestamp: startTime
    });

    const onMessage = (ev: MessageEvent<any>) => {
      const msg = ev.data;
      if (!msg || msg.requestId !== requestId) return;

      if (msg.type === 'chunk') {
        const { token, tokenId, isFirst, isLast, ttfbMs } = msg.args;
        const chunk = { token, tokenId, isFirst, isLast, ...(ttfbMs !== undefined ? { ttfbMs } : {}) };
        queue.push(chunk);

        if (!isLast) {
          tokenCount++;
        }

        // Emit token event
        eventEmitter.emit({
          type: 'generation:token',
          requestId,
          token,
          tokenId,
          isFirst,
          isLast,
          ttfbMs,
          timestamp: Date.now()
        });

      } else if (msg.type === 'done') {
        done = true;
        queue.push({ token: '', tokenId: -1, isFirst: false, isLast: true });

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

      } else if (msg.type === 'error') {
        done = true;
        queue.push({ token: '', tokenId: -1, isFirst: false, isLast: true });
        logger.session.error('Generation error', msg.error, requestId);

        // Emit error event
        eventEmitter.emit({
          type: 'generation:error',
          requestId,
          error: msg.error,
          timestamp: Date.now()
        });

      } else if (msg.type === 'debug') {
        // logger.session.debug('Worker debug message', msg.args, requestId);
      }
    };
    workerInstance.worker.addEventListener('message', onMessage as any);

    workerInstance.worker.postMessage({
      type: 'generate',
      requestId,
      args,
    });

    try {
      while (!done || queue.length) {
        if (queue.length) {
          const next = queue.shift()!;
          yield next;
        } else {
          await new Promise((r) => setTimeout(r, 1));
        }
      }
    } finally {
      workerInstance.worker.removeEventListener('message', onMessage as any);
    }
  }

  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    await workerManager.disposeAll();
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


