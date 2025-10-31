import type { GenerateArgs, WorkerInstance } from '../types/worker';
import type { TokenStreamChunk } from '../types/session';
import { DeviceProviderConfig, ProviderError, InferenceProvider } from '../types/provider';
import { EventEmitter } from '../utils/event-emitter';
import { logger } from '../utils/logger';

/**
 * WebGPU-based inference provider using Web Workers
 */
export class DeviceProvider implements InferenceProvider {
  private workerInstance: WorkerInstance | null = null;
  private readonly config: DeviceProviderConfig;
  private eventEmitter: EventEmitter;

  constructor(
    config: DeviceProviderConfig,
    eventEmitter: EventEmitter
  ) {
    this.config = config;
    this.eventEmitter = eventEmitter;
  }

  async initialize(): Promise<void> {
    if (this.workerInstance?.initialized) {
      return;
    }

    // Create worker instance if it doesn't exist
    if (!this.workerInstance) {
      logger.deviceProvider?.info('Creating Web Worker', { model: this.config.model });
      const worker = new Worker(
        new URL('../workers/runtime/worker.js', import.meta.url),
        { type: 'module' }
      );
      this.workerInstance = {
        worker,
        model: this.config,
        initialized: false,
        disposed: false,
        inflightId: 0,
      };
    }

    // Initialize the worker
    if (!this.workerInstance.initialized && !this.workerInstance.disposed) {
      const initStartTime = Date.now();

      // Emit worker init start event
      this.eventEmitter.emit({
        type: 'worker:init:start',
        modelName: this.config.model,
        timestamp: initStartTime
      });

      const initId = this.nextId();
      this.workerInstance.worker.postMessage({
        type: 'init',
        requestId: initId,
        args: {
          config: this.config,
        },
      });

      try {
        await this.once(
          initId,
          undefined,
          // Progress callback
          (msg) => {
            if (msg.type === 'progress' && msg.args) {
              this.eventEmitter.emit({
                type: 'worker:init:progress',
                modelName: this.config.model,
                progress: msg.args.progress,
                stage: msg.args.status || msg.args.file || 'loading',
                timestamp: Date.now()
              });
            }
          }
        );

        this.workerInstance.initialized = true;

        // Emit worker init complete event
        this.eventEmitter.emit({
          type: 'worker:init:complete',
          modelName: this.config.model,
          duration: Date.now() - initStartTime,
          timestamp: Date.now()
        });

        logger.deviceProvider?.info('Worker initialized successfully', {
          model: this.config.model,
          duration: Date.now() - initStartTime
        });
      } catch (error: any) {
        logger.deviceProvider?.error('Worker initialization failed', {
          model: this.config.model,
          error: error.message
        });
        throw new ProviderError(
          `Failed to initialize WebGPU provider: ${error.message}`,
          'device',
          500
        );
      }
    }
  }

  async *generate(
    args: GenerateArgs,
  ): AsyncIterable<TokenStreamChunk> {
    if (!this.workerInstance || !this.workerInstance.initialized) {
      throw new ProviderError(
        'Provider not initialized. Call initialize() first.',
        'webgpu',
        400
      );
    }

    if (this.workerInstance.disposed) {
      throw new ProviderError(
        'Provider has been disposed',
        'webgpu',
        400
      );
    }

    const requestId = this.nextId();

    // Post generate message to worker
    this.workerInstance.worker.postMessage({
      type: 'generate',
      requestId,
      args,
    });

    // Stream tokens back
    let resolved = false;
    const chunks: TokenStreamChunk[] = [];

    yield* this.streamMessages(requestId, (msg) => {
      if (msg.type === 'chunk' && msg.args) {
        const chunk: TokenStreamChunk = {
          token: msg.args.token,
          tokenId: msg.args.tokenId,
          isFirst: msg.args.isFirst,
          isLast: msg.args.isLast,
          ttfbMs: msg.args.ttfbMs,
        };
        chunks.push(chunk);
        return chunk;
      } else if (msg.type === 'done') {
        resolved = true;
        return null; // Signal end
      } else if (msg.type === 'error') {
        throw new ProviderError(
          msg.args?.error || 'Unknown error from worker',
          'webgpu',
          500
        );
      }
      return undefined;
    });

    if (!resolved) {
      throw new ProviderError(
        'Generation stream ended without completion',
        'webgpu',
        400
      );
    }
  }

  async dispose(): Promise<void> {
    if (!this.workerInstance || this.workerInstance.disposed) {
      return;
    }

    logger.deviceProvider?.info('Disposing WebGPU provider', {
      model: this.config.model
    });

    this.workerInstance.disposed = true;
    const requestId = this.nextId();

    this.workerInstance.worker.postMessage({ type: 'dispose', requestId });
    await this.once(requestId).catch(() => {});
    this.workerInstance.worker.terminate();

    // Emit worker disposed event
    this.eventEmitter.emit({
      type: 'worker:disposed',
      modelName: this.config.model,
      timestamp: Date.now()
    });

    logger.deviceProvider?.info('WebGPU provider disposed', {
      model: this.config.model
    });
  }

  isInitialized(): boolean {
    return this.workerInstance?.initialized ?? false;
  }

  getModelName(): string {
    return this.config.model;
  }

  /**
   * Generate next request ID
   */
  private nextId(): string {
    if (!this.workerInstance) {
      throw new ProviderError(
        'Worker instance not created',
        'device',
        400
      );
    }
    this.workerInstance.inflightId += 1;
    return String(this.workerInstance.inflightId);
  }

  /**
   * Wait for a single response from the worker
   */
  private once<T = unknown>(
    requestId: string,
    filter?: (m: any) => boolean,
    onProgress?: (msg: any) => void
  ): Promise<T> {
    if (!this.workerInstance) {
      return Promise.reject(
        new ProviderError('Worker instance not created', 'device', 400)
      );
    }

    return new Promise((resolve, reject) => {
      const onMessage = (ev: MessageEvent<any>) => {
        const msg = ev.data;
        if (!msg || msg.requestId !== requestId) return;

        // Handle progress messages separately
        if (msg.type === 'progress' && onProgress) {
          onProgress(msg);
          return; // Don't resolve/reject on progress
        }

        if (filter && !filter(msg)) return;

        this.workerInstance!.worker.removeEventListener('message', onMessage as any);
        this.workerInstance!.worker.removeEventListener('error', onError as any);

        if (msg.type === 'error') {
          reject(new ProviderError(
            msg.args?.error || 'Worker error',
            'webgpu',
            500
          ));
        } else {
          resolve(msg);
        }
      };

      const onError = (e: ErrorEvent) => {
        this.workerInstance!.worker.removeEventListener('message', onMessage as any);
        this.workerInstance!.worker.removeEventListener('error', onError as any);
        reject(
          new ProviderError(
            e.error?.message || e.message || 'Worker error',
            'webgpu',
            500
          )
        );
      };

      this.workerInstance!.worker.addEventListener('message', onMessage as any);
      this.workerInstance!.worker.addEventListener('error', onError as any);
    });
  }

  /**
   * Stream messages from the worker
   */
  private async *streamMessages<T>(
    requestId: string,
    handler: (msg: any) => T | null | undefined
  ): AsyncIterable<T> {
    if (!this.workerInstance) {
      throw new ProviderError('Worker instance not created', 'device', 400);
    }

    const messageQueue: T[] = [];
    let isDone = false;
    let error: Error | null = null;
    let resolveNext: ((value: IteratorResult<T>) => void) | null = null;

    const onMessage = (ev: MessageEvent<any>) => {
      const msg = ev.data;
      if (!msg || msg.requestId !== requestId) return;

      try {
        const result = handler(msg);

        if (result === null) {
          // Signal to end stream
          isDone = true;
          if (resolveNext) {
            resolveNext({ value: undefined as any, done: true });
            resolveNext = null;
          }
        } else if (result !== undefined) {
          // Add to queue
          messageQueue.push(result);
          if (resolveNext) {
            const value = messageQueue.shift()!;
            resolveNext({ value, done: false });
            resolveNext = null;
          }
        }
      } catch (e: any) {
        error = e;
        isDone = true;
        if (resolveNext) {
          resolveNext({ value: undefined as any, done: true });
          resolveNext = null;
        }
      }
    };

    const onError = (e: ErrorEvent) => {
      error = new ProviderError(
        e.error?.message || e.message || 'Worker error',
        'device',
        500
      );
      isDone = true;
      if (resolveNext) {
        resolveNext({ value: undefined as any, done: true });
        resolveNext = null;
      }
    };

    this.workerInstance.worker.addEventListener('message', onMessage as any);
    this.workerInstance.worker.addEventListener('error', onError as any);

    try {
      while (true) {
        if (error) {
          throw error;
        }

        if (messageQueue.length > 0) {
          yield messageQueue.shift()!;
          continue;
        }

        if (isDone) {
          break;
        }

        // Wait for next message
        await new Promise<IteratorResult<T>>((resolve) => {
          resolveNext = resolve;
        });

        if (error) {
          throw error;
        }

        if (messageQueue.length > 0) {
          yield messageQueue.shift()!;
        }

        if (isDone) {
          break;
        }
      }
    } finally {
      this.workerInstance.worker.removeEventListener('message', onMessage as any);
      this.workerInstance.worker.removeEventListener('error', onError as any);
    }
  }
}
