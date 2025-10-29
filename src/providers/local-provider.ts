import { BaseProvider } from "./base-provider";
import { LocalProviderConfig, GenerationMetadata } from "../types/provider";
import { GenerateArgs, WorkerInstance, OutboundMessage, ChunkArgs, ProgressArgs } from "../types/worker";
import { TokenStreamChunk } from "../types/session";
import { logger } from "../utils/logger";

/**
 * Local provider that runs quantized models on WebGPU/WASM using Web Workers
 * Wraps the existing Worker implementation for backward compatibility
 */
export class LocalProvider extends BaseProvider {
  declare config: LocalProviderConfig;
  private workerInstance: WorkerInstance | null = null;
  private inflightId: number = 0;

  constructor(config: LocalProviderConfig) {
    super(config);
  }

  /**
   * Initialize the local provider by creating and initializing the worker
   */
  async initialize(): Promise<void> {
    this.assertNotDisposed();

    if (this._initialized) {
      logger.localProvider.debug('LocalProvider already initialized');
      return;
    }

    logger.localProvider.info('Initializing LocalProvider', {
      model: this.config.model.name,
      engine: this.config.engine
    });

    const initStartTime = Date.now();

    // Emit init start event
    this.events.emit({
      type: 'provider:init:start',
      provider: 'local',
      model: this.config.model.name,
      timestamp: initStartTime
    });

    try {
      // Create worker instance
      this.workerInstance = this.createWorkerInstance();

      // Initialize the worker
      const initId = this.nextRequestId();
      this.workerInstance.worker.postMessage({
        type: 'init',
        requestId: initId,
        args: {
          model: this.config.model,
          engine: this.config.engine,
          hfToken: this.config.hfToken,
        },
      });

      // Wait for initialization to complete
      await this.once(
        initId,
        undefined,
        // Progress callback
        (msg) => {
          if (msg.type === 'progress' && msg.args) {
            const args = msg.args as ProgressArgs;
            this.events.emit({
              type: 'provider:init:progress',
              provider: 'local',
              model: this.config.model.name,
              progress: args.progress,
              stage: args.status || args.file || 'loading',
              timestamp: Date.now()
            });
          }
        }
      );

      this.workerInstance.initialized = true;
      this._initialized = true;

      // Emit init complete event
      this.events.emit({
        type: 'provider:init:complete',
        provider: 'local',
        model: this.config.model.name,
        duration: Date.now() - initStartTime,
        timestamp: Date.now()
      });

      logger.localProvider.info('LocalProvider initialized successfully', {
        model: this.config.model.name,
        duration: Date.now() - initStartTime
      });
    } catch (error: any) {
      this.events.emit({
        type: 'provider:error',
        provider: 'local',
        model: this.config.model.name,
        error,
        timestamp: Date.now()
      });

      logger.localProvider.error('LocalProvider initialization failed', {
        model: this.config.model.name,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Generate a response stream using the local worker
   */
  async *generate(args: GenerateArgs): AsyncIterable<TokenStreamChunk> {
    this.assertReady();

    if (!this.workerInstance) {
      throw new Error('Worker instance not created');
    }

    const requestId = this.nextRequestId();
    const requestStartTime = Date.now();

    // Clear previous metadata
    this.clearMetadata();

    // Emit generation start event
    this.events.emit({
      type: 'provider:request:start',
      provider: 'local',
      model: this.config.model.name,
      timestamp: requestStartTime
    });

    logger.localProvider.debug('Starting generation', {
      model: this.config.model.name,
      requestId,
      messageCount: args.messages.length
    });

    try {
      // Post generate message to worker
      this.workerInstance.worker.postMessage({
        type: 'generate',
        requestId,
        args,
      });

      // Stream tokens from worker
      let totalTokens = 0;
      let ttfbMs: number | undefined;

      for await (const msg of this.streamMessages(requestId)) {
        if (msg.type === 'chunk' && msg.args) {
          const chunkArgs = msg.args as ChunkArgs;
          totalTokens++;

          // Capture TTFB from first token
          if (chunkArgs.isFirst && chunkArgs.ttfbMs !== undefined) {
            ttfbMs = chunkArgs.ttfbMs;
          }

          // Calculate tokens per second
          const elapsedMs = Date.now() - requestStartTime;
          const tokensPerSecond = totalTokens / (elapsedMs / 1000);

          const chunk: TokenStreamChunk = {
            token: chunkArgs.token,
            tokenId: chunkArgs.tokenId,
            isFirst: chunkArgs.isFirst,
            isLast: chunkArgs.isLast,
            ...(chunkArgs.ttfbMs !== undefined && { ttfbMs: chunkArgs.ttfbMs }),
            tokensPerSecond
          };

          yield chunk;

          // If this is the last chunk, set metadata
          if (chunkArgs.isLast) {
            const metadata: GenerationMetadata = {
              model: this.config.model.name,
              ...(ttfbMs !== undefined && { ttfbMs }),
              finish_reason: 'stop'
            };
            this.setMetadata(metadata);
          }
        } else if (msg.type === 'error') {
          const errorMsg = (msg.args as any)?.error || 'Generation error';
          throw new Error(errorMsg);
        }
      }

      // Emit generation complete event
      this.events.emit({
        type: 'provider:request:complete',
        provider: 'local',
        model: this.config.model.name,
        duration: Date.now() - requestStartTime,
        timestamp: Date.now()
      });

      logger.localProvider.debug('Generation completed', {
        model: this.config.model.name,
        requestId,
        totalTokens,
        duration: Date.now() - requestStartTime
      });
    } catch (error: any) {
      this.events.emit({
        type: 'provider:error',
        provider: 'local',
        model: this.config.model.name,
        error,
        timestamp: Date.now()
      });

      logger.localProvider.error('Generation failed', {
        model: this.config.model.name,
        requestId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Dispose of the local provider and terminate the worker
   */
  async dispose(): Promise<void> {
    if (this._disposed) {
      return;
    }

    logger.localProvider.info('Disposing LocalProvider', {
      model: this.config.model.name
    });

    if (this.workerInstance && !this.workerInstance.disposed) {
      const requestId = this.nextRequestId();
      this.workerInstance.disposed = true;

      try {
        this.workerInstance.worker.postMessage({ type: 'dispose', requestId });
        await this.once(requestId).catch(() => {});
        this.workerInstance.worker.terminate();

        logger.localProvider.info('Worker terminated successfully', {
          model: this.config.model.name
        });
      } catch (error: any) {
        logger.localProvider.error('Error terminating worker', {
          model: this.config.model.name,
          error: error.message
        });
      }
    }

    this.workerInstance = null;
    this._disposed = true;
  }

  /**
   * Create a new worker instance
   */
  private createWorkerInstance(): WorkerInstance {
    const worker = new Worker(new URL('../workers/runtime/worker.js', import.meta.url), { type: 'module' });
    return {
      worker,
      model: this.config.model,
      initialized: false,
      disposed: false,
      inflightId: 0,
    };
  }

  /**
   * Generate next request ID
   */
  private nextRequestId(): string {
    this.inflightId += 1;
    return String(this.inflightId);
  }

  /**
   * Wait for a single message from the worker
   */
  private once<T = unknown>(
    requestId: string,
    filter?: (m: any) => boolean,
    onProgress?: (msg: any) => void
  ): Promise<T> {
    if (!this.workerInstance) {
      return Promise.reject(new Error('Worker instance not created'));
    }

    return new Promise((resolve, reject) => {
      const worker = this.workerInstance!.worker;

      const onMessage = (ev: MessageEvent<any>) => {
        const msg = ev.data;
        if (!msg || msg.requestId !== requestId) return;

        // Handle progress messages separately
        if (msg.type === 'progress' && onProgress) {
          onProgress(msg);
          return; // Don't resolve/reject on progress
        }

        if (filter && !filter(msg)) return;

        worker.removeEventListener('message', onMessage as any);
        worker.removeEventListener('error', onError as any);

        if (msg.type === 'error') {
          const errorMsg = (msg.args as any)?.error || 'Worker error';
          reject(new Error(errorMsg));
        } else {
          resolve(msg);
        }
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

  /**
   * Stream messages from the worker until done
   */
  private async *streamMessages(requestId: string): AsyncIterable<OutboundMessage> {
    if (!this.workerInstance) {
      throw new Error('Worker instance not created');
    }

    const worker = this.workerInstance.worker;
    const messageQueue: OutboundMessage[] = [];
    let done = false;
    let error: Error | null = null;
    let resolver: (() => void) | null = null;

    const onMessage = (ev: MessageEvent<any>) => {
      const msg = ev.data as OutboundMessage;
      if (!msg || msg.requestId !== requestId) return;

      if (msg.type === 'done') {
        done = true;
        cleanup();
        if (resolver) resolver();
        return;
      }

      if (msg.type === 'error') {
        const errorMsg = (msg.args as any)?.error || 'Worker error';
        error = new Error(errorMsg);
        cleanup();
        if (resolver) resolver();
        return;
      }

      messageQueue.push(msg);
      if (resolver) resolver();
    };

    const onError = (e: ErrorEvent) => {
      error = e.error || new Error(e.message);
      cleanup();
      if (resolver) resolver();
    };

    const cleanup = () => {
      worker.removeEventListener('message', onMessage as any);
      worker.removeEventListener('error', onError as any);
    };

    worker.addEventListener('message', onMessage as any);
    worker.addEventListener('error', onError as any);

    try {
      while (!done && !error) {
        // Yield all queued messages
        while (messageQueue.length > 0) {
          yield messageQueue.shift()!;
        }

        // Wait for more messages if not done
        if (!done && !error) {
          await new Promise<void>(resolve => {
            resolver = resolve;
          });
          resolver = null;
        }
      }

      // Yield any remaining messages
      while (messageQueue.length > 0) {
        yield messageQueue.shift()!;
      }

      if (error) {
        throw error;
      }
    } finally {
      cleanup();
    }
  }
}
