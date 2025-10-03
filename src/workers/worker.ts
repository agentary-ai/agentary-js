import { pipeline, TextStreamer, env as hfEnv, DataType, TextGenerationPipeline, TextGenerationConfig } from '@huggingface/transformers';
import { InboundMessage, OutboundMessage } from '../types/worker';
import { logger } from '../utils/logger';
import { InitArgs, GenerateArgs } from '../types/worker';

// (hfEnv as any).backends = {
//   onnx: {
//     wasmPaths: 'https://unpkg.com/onnxruntime-web@1.22.0/dist/',
//   },
// };

let generator: TextGenerationPipeline | null = null;
let disposed = false;
let isGenerating = false;

function post(message: OutboundMessage) {
  // eslint-disable-next-line no-restricted-globals
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
}

function postDebug(requestId: string, message: string, data?: unknown) {
  const debugMessage: OutboundMessage = {
    type: 'debug',
    requestId,
    args: { message, ...(data !== undefined ? { data } : {}) } as const,
  };
  post(debugMessage);
  logger.worker.debug(message, data, requestId);
}

async function handleInit(msg: InboundMessage) {
  if (disposed) throw new Error('Worker disposed');
  const { model, engine, hfToken } = msg.args as InitArgs;

  logger.worker.info('Initializing worker', { model:model.name, quantization:model.quantization, engine }, msg.requestId);

  if (hfToken) {
    (hfEnv as any).HF_TOKEN = hfToken;
  }

  const device = engine && engine !== 'auto' ? engine : 'webgpu';

  // TODO: Add support for other tasks
  const pipelineResult = await pipeline('text-generation', model.name, {
    device: device || "auto",
    dtype: model.quantization || "auto",
    progress_callback: (_info: any) => {},
  });
  generator = pipelineResult as TextGenerationPipeline;

  logger.worker.info('Worker initialized successfully', { model, device }, msg.requestId);
  post({ type: 'ack', requestId: msg.requestId });
}

async function handleGenerate(msg: InboundMessage) {
  postDebug(msg.requestId, 'Generate request received', msg.args);

  if (!generator) throw new Error('Generator not initialized');
  if (disposed) throw new Error('Worker disposed');
  if (isGenerating) throw new Error('A generation task is already running');

  isGenerating = true;

  const { messages, max_new_tokens, temperature, top_p, top_k, stop, tools, repetition_penalty, enable_thinking } = msg.args as GenerateArgs;
  if (!messages) throw new Error('Messages are required');

  // If tools are provided, or even if not, pre-apply the chat template so we can
  // pass tool schemas to the tokenizer. Disable special tokens when generating.
  const applyTemplateOptions: any = {
    tokenize: false,
    add_generation_prompt: true,
    enable_thinking: enable_thinking ?? false,
  };
  if (Array.isArray(tools) && tools.length) {
    applyTemplateOptions.tools = tools;
  }
  const renderedPrompt: string = generator.tokenizer.apply_chat_template(messages, applyTemplateOptions) as string;
  // TODO: Add warning if tools aren't supported in rendered prompt
  postDebug(msg.requestId, 'Rendered chat template', renderedPrompt);

  let first = true;
  const ttfbStart = performance.now();

  const streamer = new TextStreamer(generator.tokenizer, {
    skip_prompt: true,
    callback_function: (text: string) => {
      const args = {
        token: text,
        tokenId: -1,
        isFirst: first,
        isLast: false,
        ...(first ? { ttfbMs: performance.now() - ttfbStart } : {}),
      } as const;
      first = false;
      post({ type: 'chunk', requestId: msg.requestId, args });
    },
  });

  try {
    const generationOptions = {
      add_special_tokens: false,
      // TODO: Make this configurable
      max_new_tokens: max_new_tokens ?? 1024,
      do_sample: temperature !== undefined ? temperature > 0 : false,
      ...(temperature !== undefined && { temperature }),
      ...(top_p !== undefined && { top_p }),
      ...(top_k !== undefined && { top_k }),
      repetition_penalty: repetition_penalty || 1.1,
      streamer,
      ...(stop !== undefined && { stop }),
    };
    logger.worker.debug('Starting generation', generationOptions, msg.requestId);
    await generator(renderedPrompt, generationOptions);
    logger.worker.debug('Generation completed successfully', undefined, msg.requestId);
  } finally {
    isGenerating = false;
  }

  post({ type: 'done', requestId: msg.requestId });
}

async function handleDispose(msg: InboundMessage) {
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
}

// eslint-disable-next-line no-restricted-globals
(self as unknown as DedicatedWorkerGlobalScope).onmessage = async (ev: MessageEvent<InboundMessage>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      await handleInit(msg);
      return;
    }
    if (msg.type === 'generate') {
      await handleGenerate(msg);
      return;
    }
    if (msg.type === 'dispose') {
      await handleDispose(msg);
      return;
    }
  } catch (error: any) {
    const requestId = (msg as any)?.requestId ?? 'unknown';
    const errorMessage = error?.message ?? String(error);
    
    logger.worker.error('Worker error', { error: errorMessage, stack: error?.stack }, requestId);
    post({ type: 'error', requestId, args: { error: errorMessage } });
  }
};

export {};


