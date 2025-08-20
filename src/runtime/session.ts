import { type CreateSessionArgs, type GenerateArgs, type Session, type TokenStreamChunk } from '../types/api';
import { WorkerManager, type WorkerInstance } from './worker-manager';
import { logger } from '../utils/logger';

export async function createSession(args: CreateSessionArgs): Promise<Session> {
  const workerManager = new WorkerManager(args);
  let disposed = false;

  function nextId(workerInstance: WorkerInstance): string { 
    workerInstance.inflightId += 1; 
    return String(workerInstance.inflightId); 
  }

  async function* generate(gen: GenerateArgs): AsyncIterable<TokenStreamChunk> {
    if (disposed) throw new Error('Session disposed');
    
    // Get the appropriate worker for this generation task
    const workerInstance = await workerManager.getWorkerForGeneration(gen);
    const requestId = nextId(workerInstance);

    const queue: TokenStreamChunk[] = [];
    let done = false;

    const onMessage = (ev: MessageEvent<any>) => {
      const msg = ev.data;
      if (!msg || msg.requestId !== requestId) return;

      if (msg.type === 'chunk') {
        const { token, tokenId, isFirst, isLast, ttfbMs } = msg.payload;
        queue.push({ token, tokenId, isFirst, isLast, ...(ttfbMs !== undefined ? { ttfbMs } : {}) });

      } else if (msg.type === 'done') {
        done = true;
        queue.push({ token: '', tokenId: -1, isFirst: false, isLast: true });

      } else if (msg.type === 'error') {
        done = true;
        queue.push({ token: '', tokenId: -1, isFirst: false, isLast: true });
        logger.session.error('Generation error', msg.error, requestId);
        
      } else if (msg.type === 'debug') {
        logger.session.debug('Worker debug message', msg.payload, requestId);
      }
    };

    workerInstance.worker.addEventListener('message', onMessage as any);

    workerInstance.worker.postMessage({
      type: 'generate',
      requestId,
      args: {
        prompt: gen.prompt,
        system: gen.system,
        tools: gen.tools,
        stop: gen.stop,
        temperature: gen.temperature,
        top_p: gen.top_p,
        top_k: gen.top_k,
        repetition_penalty: gen.repetition_penalty,
        seed: gen.seed,
        deterministic: gen.deterministic,
      },
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

  const session: Session = { generate, dispose };
  return session;
}


