import type {
  TextGenerationPipeline,
  ProgressInfo,
  Message
} from '@huggingface/transformers';
import { InboundMessage, OutboundMessage } from '../types/worker';
import { logger } from '../utils/logger';
import { InitArgs, GenerateArgs } from '../types/worker';
import { MessageTransformer, getMessageTransformer } from '../providers/device-model-config';

// Dynamic import with error handling for missing peer dependency
let pipeline: any;
let TextStreamer: any;
let hfEnv: any;
let transformersLoaded = false;

async function loadTransformers() {
  if (transformersLoaded) return;

  try {
    const transformers = await import('@huggingface/transformers');
    pipeline = transformers.pipeline;
    TextStreamer = transformers.TextStreamer;
    hfEnv = transformers.env;
    transformersLoaded = true;
  } catch (error: any) {
    // Post error message back to main thread
    self.postMessage({
      type: 'error',
      requestId: 'init',
      args: {
        error: 'Missing peer dependency: @huggingface/transformers is required for device-based inference.\n' +
               'Install it with: npm install @huggingface/transformers\n' +
               'You also need to configure your bundler to copy ONNX Runtime assets.\n' +
               'See: https://docs.agentary.ai/guides/vite-configuration for setup instructions.\n' +
               'Note: This dependency is only required if you are using device (local) models. ' +
               'Cloud-only users can skip this installation.'
      }
    });
    throw error;
  }
}

let generator: TextGenerationPipeline | null = null;
let disposed = false;
let isGenerating = false;
let messageTransformer: MessageTransformer | null = null;

function post(message: OutboundMessage) {
  // eslint-disable-next-line no-restricted-globals
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
}

// function postDebug(requestId: string, message: string, data?: unknown) {
//   const debugMessage: OutboundMessage = {
//     type: 'debug',
//     requestId,
//     args: { message, ...(data !== undefined ? { data } : {}) } as const,
//   };
//   post(debugMessage);
//   logger.worker.debug(message, data, requestId);
// }

async function handleInit(msg: InboundMessage) {
  if (disposed) throw new Error('Worker disposed');
  const { config } = msg.args as InitArgs;

  logger.worker.debug('Initializing worker', { model:config.model, quantization:config.quantization, engine:config.engine }, msg.requestId);

  // Load Transformers.js dynamically
  await loadTransformers();

  // Get the message transformer for this model
  try {
    messageTransformer = getMessageTransformer(config.model);
    logger.worker.debug('Message transformer loaded', { model: config.model }, msg.requestId);
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to load message transformer';
    logger.worker.error('Message transformer initialization failed', { error: errorMessage }, msg.requestId);
    throw new Error(`Failed to initialize message transformer: ${errorMessage}`);
  }

  if (config.hfToken) {
    (hfEnv as any).HF_TOKEN = config.hfToken;
  }

  const device = config.engine && config.engine !== 'auto' ? config.engine : 'webgpu';

  const pipelineResult = await pipeline('text-generation', config.model, {
    device: device || "auto",
    dtype: config.quantization || "auto",
    progress_callback: (info: ProgressInfo) => {
      // Send progress updates back to main thread
      // ProgressInfo can be InitiateProgressInfo, DownloadProgressInfo, ProgressProgressInfo, DoneProgressInfo, or ReadyProgressInfo
      let progress = 0;
      let loaded = 0;
      let total = 0;
      let name = '';
      let file = '';

      // Handle different progress info types
      if ('progress' in info) {
        progress = info.progress;
      }
      if ('loaded' in info) {
        loaded = info.loaded;
      }
      if ('total' in info) {
        total = info.total;
      }
      if ('name' in info) {
        name = info.name;
      }
      if ('file' in info) {
        file = info.file;
      }

      const progressPercent = total > 0 ? (loaded / total) * 100 : progress;

      post({
        type: 'progress',
        requestId: msg.requestId,
        args: {
          status: info.status,
          name: name || '',
          file: file || '',
          progress: Math.round(progressPercent),
          loaded,
          total
        }
      });

      logger.worker.verbose('Model loading progress', {
        status: info.status,
        file: file || 'unknown',
        progress: `${Math.round(progressPercent)}%`
      }, msg.requestId);
    },
  });
  generator = pipelineResult as TextGenerationPipeline;

  logger.worker.info('Worker initialized successfully', { model: config.model, device: config.engine }, msg.requestId);
  post({ type: 'ack', requestId: msg.requestId });
}

async function handleGenerate(msg: InboundMessage) {
  logger.worker.debug('Generate request received', { args: msg.args }, msg.requestId);

  if (!generator) throw new Error('Generator not initialized');
  if (!messageTransformer) throw new Error('Message transformer not initialized');
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

  // Transform messages using model-specific transformer
  const tokenizerMessages: Message[] = messageTransformer(messages);
  logger.worker.debug('Messages transformed to tokenizer format', { count: tokenizerMessages.length }, msg.requestId);
  logger.worker.verbose('Messages transformed to tokenizer format', { messages: tokenizerMessages }, msg.requestId);

  const renderedPrompt: string = generator.tokenizer.apply_chat_template(tokenizerMessages, applyTemplateOptions) as string;
  logger.worker.verbose('Rendered chat template', { prompt: renderedPrompt }, msg.requestId);

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
    const start = performance.now();
    await generator(renderedPrompt, generationOptions);
    logger.worker.debug('Generation completed successfully', { duration: performance.now() - start }, msg.requestId);
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
  messageTransformer = null;
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


