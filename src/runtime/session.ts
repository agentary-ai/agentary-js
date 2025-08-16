import { type CreateSessionArgs, type GenerateArgs, type Session, type TokenStreamChunk } from '../types/api';

export async function createSession(args: CreateSessionArgs): Promise<Session> {
  const worker = new Worker(new URL('./runtime/worker.js', import.meta.url), { type: 'module' });

  let disposed = false;
  let inflightId = 0;

  function nextId(): string { inflightId += 1; return String(inflightId); }

  function once<T = unknown>(requestId: string, filter?: (m: any) => boolean): Promise<T> {
    return new Promise((resolve, reject) => {
      const onMessage = (ev: MessageEvent<any>) => {
        const msg = ev.data;
        if (!msg || msg.requestId !== requestId) return;
        if (filter && !filter(msg)) return;
        worker.removeEventListener('message', onMessage as any);
        worker.removeEventListener('error', onError as any);
        if (msg.type === 'error') reject(new Error(msg.error));
        else resolve(msg);
      };
      const onError = (e: ErrorEvent) => {
        worker.removeEventListener('message', onMessage as any);
        worker.removeEventListener('error', onError as any);
        reject(e.error || new Error(e.message));
      };
      worker.addEventListener('message', onMessage as any);
      worker.addEventListener('error', onError as any);
    });
  }

  const initId = nextId();
  worker.postMessage({ type: 'init', requestId: initId, args: { model: args.model, engine: args.engine, hfToken: args.hfToken } });
  await once(initId);

  async function* generate(gen: GenerateArgs): AsyncIterable<TokenStreamChunk> {
    if (disposed) throw new Error('Session disposed');
    const requestId = nextId();

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
        console.error('Generation error', msg.error);
      }
    };

    worker.addEventListener('message', onMessage as any);

    worker.postMessage({
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
      worker.removeEventListener('message', onMessage as any);
    }
  }

  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    const requestId = nextId();
    worker.postMessage({ type: 'dispose', requestId });
    await once(requestId).catch(() => {});
    worker.terminate();
  }

  const session: Session = { generate, dispose };
  return session;
}


