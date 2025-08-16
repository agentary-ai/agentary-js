import { pipeline as hfPipeline, TextStreamer, env as hfEnv } from '@huggingface/transformers';

type EngineKind = 'auto' | 'webgpu' | 'wasm' | 'webnn';

interface InitMessage {
  type: 'init';
  requestId: string;
  args: {
    model: string;
    adapters?: string[];
    ctx?: number;
    engine?: EngineKind;
    hfToken?: string;
  };
}

interface GenerateMessage {
  type: 'generate';
  requestId: string;
  args: {
    prompt?: string;
    system?: string;
    tools?: unknown[];
    stop?: string[];
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repetition_penalty?: number;
    seed?: number;
    deterministic?: boolean;
  };
}

interface DisposeMessage {
  type: 'dispose';
  requestId: string;
}

type InboundMessage = InitMessage | GenerateMessage | DisposeMessage;

interface ChunkMessage {
  type: 'chunk';
  requestId: string;
  payload: {
    token: string;
    tokenId: number;
    isFirst: boolean;
    isLast: boolean;
    ttfbMs?: number;
  };
}

interface AckMessage {
  type: 'ack';
  requestId: string;
}

interface DoneMessage {
  type: 'done';
  requestId: string;
}

interface ErrorMessage {
  type: 'error';
  requestId: string;
  error: string;
}

type OutboundMessage = ChunkMessage | AckMessage | DoneMessage | ErrorMessage;

let generator: any | null = null;
let disposed = false;
let isGenerating = false;

function post(message: OutboundMessage) {
  // eslint-disable-next-line no-restricted-globals
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
}

// eslint-disable-next-line no-restricted-globals
(self as unknown as DedicatedWorkerGlobalScope).onmessage = async (ev: MessageEvent<InboundMessage>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      if (disposed) throw new Error('Worker disposed');
      const { model, engine, hfToken } = msg.args;

      if (hfToken) {
        (hfEnv as any).HF_TOKEN = hfToken;
      }

      const device = engine && engine !== 'auto' ? engine : 'webgpu';

      generator = await hfPipeline('text-generation', model, {
        device,
        dtype: 'q4',
        progress_callback: (_info: any) => {},
      });

      post({ type: 'ack', requestId: msg.requestId });
      return;
    }

    if (msg.type === 'generate') {
      if (!generator) throw new Error('Generator not initialized');
      if (disposed) throw new Error('Worker disposed');
      if (isGenerating) throw new Error('A generation task is already running');

      isGenerating = true;

      const { prompt, temperature, top_p, top_k, stop } = msg.args;
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: prompt ?? '' },
      ];

      let first = true;
      const ttfbStart = performance.now();

      const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        callback_function: (text: string) => {
          const payload = {
            token: text,
            tokenId: -1,
            isFirst: first,
            isLast: false,
            ...(first ? { ttfbMs: performance.now() - ttfbStart } : {}),
          } as const;
          first = false;
          post({ type: 'chunk', requestId: msg.requestId, payload });
        },
      });

      try {
        await generator(messages, {
          max_new_tokens: 512,
          do_sample: temperature !== undefined ? temperature > 0 : false,
          temperature,
          top_p,
          top_k,
          streamer,
          stop,
        });
      } finally {
        isGenerating = false;
      }

      post({ type: 'done', requestId: msg.requestId });
      return;
    }

    if (msg.type === 'dispose') {
      if (disposed) {
        post({ type: 'ack', requestId: msg.requestId });
        return;
      }
      disposed = true;
      try { await generator?.dispose?.(); } catch {}
      generator = null;
      post({ type: 'ack', requestId: msg.requestId });
      // eslint-disable-next-line no-restricted-globals
      (self as unknown as DedicatedWorkerGlobalScope).close();
      return;
    }
  } catch (error: any) {
    post({ type: 'error', requestId: (msg as any)?.requestId ?? 'unknown', error: error?.message ?? String(error) });
  }
};

export {};


