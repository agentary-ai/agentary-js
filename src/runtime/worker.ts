import { pipeline, TextStreamer, env as hfEnv, DataType } from '@huggingface/transformers';

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
    quantization?: DataType
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

interface DebugMessage {
  type: 'debug';
  requestId: string;
  payload: {
    message: string;
    data?: unknown;
  };
}

type OutboundMessage = ChunkMessage | AckMessage | DoneMessage | ErrorMessage | DebugMessage;

let generator: any | null = null;
let disposed = false;
let isGenerating = false;

function post(message: OutboundMessage) {
  // eslint-disable-next-line no-restricted-globals
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
}

function postDebug(requestId: string, message: string, data?: unknown) {
  const payload = { message, ...(data !== undefined ? { data } : {}) } as const;
  post({ type: 'debug', requestId, payload });
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

      generator = await pipeline('text-generation', model, {
        device,
        dtype: msg.args.quantization || "auto",
        progress_callback: (_info: any) => {},
      });

      post({ type: 'ack', requestId: msg.requestId });
      return;
    }

    if (msg.type === 'generate') {

      postDebug(msg.requestId, 'generate request received', msg.args);

      if (!generator) throw new Error('Generator not initialized');
      if (disposed) throw new Error('Worker disposed');
      if (isGenerating) throw new Error('A generation task is already running');

      isGenerating = true;

      const { prompt, temperature, top_p, top_k, stop, tools, repetition_penalty } = msg.args as any;

      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: prompt ?? '' },
      ];

      // If tools are provided, or even if not, pre-apply the chat template so we can
      // pass tool schemas to the tokenizer. Disable special tokens when generating.
      const renderedPrompt: string = (generator as any).tokenizer.apply_chat_template(messages, {
        tokenize: false,
        add_generation_prompt: true,
        tools: Array.isArray(tools) && tools.length ? tools : null,
      });

      
      postDebug(msg.requestId, 'rendered_prompt', renderedPrompt);

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
        await generator(renderedPrompt, {
          // We already applied the chat template, so avoid adding BOS/EOS again.
          add_special_tokens: false,
          max_new_tokens: 512,
          do_sample: temperature !== undefined ? temperature > 0 : false,
          temperature,
          top_p,
          top_k,
          repetition_penalty: repetition_penalty || 1.1,
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


