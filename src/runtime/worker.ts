import { pipeline, TextStreamer, env as hfEnv } from '@huggingface/transformers';
import { InboundMessage, OutboundMessage } from '../types/worker';
import { logger } from '../utils/logger';

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
  // Also log locally in worker for immediate visibility
  logger.worker.debug(message, data, requestId);
}

// eslint-disable-next-line no-restricted-globals
(self as unknown as DedicatedWorkerGlobalScope).onmessage = async (ev: MessageEvent<InboundMessage>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      if (disposed) throw new Error('Worker disposed');
      const { model, engine, hfToken } = msg.args;

      logger.worker.info('Initializing worker', { model, engine, quantization: msg.args.quantization }, msg.requestId);

      if (hfToken) {
        (hfEnv as any).HF_TOKEN = hfToken;
      }

      const device = engine && engine !== 'auto' ? engine : 'webgpu';

      generator = await pipeline('text-generation', model, {
        device,
        dtype: msg.args.quantization || "auto",
        progress_callback: (_info: any) => {},
      });

      logger.worker.info('Worker initialized successfully', { model, device }, msg.requestId);
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
        const generationOptions = {
          add_special_tokens: false,
          max_new_tokens: 512,
          do_sample: temperature !== undefined ? temperature > 0 : false,
          temperature,
          top_p,
          top_k,
          repetition_penalty: repetition_penalty || 1.1,
          streamer,
          stop,
        };
        
        logger.worker.debug('Starting generation', generationOptions, msg.requestId);
        
        await generator(renderedPrompt, generationOptions);
        
        logger.worker.debug('Generation completed successfully', undefined, msg.requestId);
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
      
      logger.worker.info('Disposing worker', undefined, msg.requestId);
      disposed = true;
      
      try { 
        await generator?.dispose?.();
        logger.worker.debug('Generator disposed successfully', undefined, msg.requestId);
      } catch (error: any) {
        logger.worker.warn('Error disposing generator', error?.message, msg.requestId);
      }
      
      generator = null;
      post({ type: 'ack', requestId: msg.requestId });
      // eslint-disable-next-line no-restricted-globals
      (self as unknown as DedicatedWorkerGlobalScope).close();
      return;
    }
  } catch (error: any) {
    const requestId = (msg as any)?.requestId ?? 'unknown';
    const errorMessage = error?.message ?? String(error);
    
    logger.worker.error('Worker error', { error: errorMessage, stack: error?.stack }, requestId);
    post({ type: 'error', requestId, error: errorMessage });
  }
};

export {};


