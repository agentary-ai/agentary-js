import { type CreateSessionArgs, type Session, type TokenStreamChunk, type GenerationTask, type WorkerInstance } from '../types/api';
import { GenerateArgs } from '../types/worker';
import { WorkerManager } from '../workers/manager';
import { logger } from '../utils/logger';

/**
 * Creates a new session with the specified configuration.
 * @param args - The configuration for the session.
 * @returns A new session.
 */
export async function createSession(args: CreateSessionArgs = {}): Promise<Session> {
  const workerManager = new WorkerManager(args);
  let disposed = false;

  function nextId(workerInstance: WorkerInstance): string { 
    workerInstance.inflightId += 1; 
    return String(workerInstance.inflightId); 
  }

  async function* createResponse(args: GenerateArgs, generationTask?: GenerationTask): AsyncIterable<TokenStreamChunk> {
    if (disposed) throw new Error('Session disposed');
    
    // Retrieve worker for model generation
    const workerInstance = await workerManager.getWorker(args, generationTask);
    const requestId = nextId(workerInstance);

    const queue: TokenStreamChunk[] = [];
    let done = false;

    const onMessage = (ev: MessageEvent<any>) => {
      const msg = ev.data;
      if (!msg || msg.requestId !== requestId) return;

      if (msg.type === 'chunk') {
        const { token, tokenId, isFirst, isLast, ttfbMs } = msg.args;
        queue.push({ token, tokenId, isFirst, isLast, ...(ttfbMs !== undefined ? { ttfbMs } : {}) });

      } else if (msg.type === 'done') {
        done = true;
        queue.push({ token: '', tokenId: -1, isFirst: false, isLast: true });

      } else if (msg.type === 'error') {
        done = true;
        queue.push({ token: '', tokenId: -1, isFirst: false, isLast: true });
        logger.session.error('Generation error', msg.error, requestId);
        
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
  }

  const session: Session = { createResponse, dispose, workerManager };
  return session;
}


