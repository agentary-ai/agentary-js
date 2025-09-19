import {
  type CreateSessionArgs,
  type GenerationTask,
  type WorkerInstance,
  type Model
} from '../types/api';
import { GenerateArgs } from '../types/worker';
import { logger } from '../utils/logger';

export class WorkerManager {
  private workers: Map<string, WorkerInstance> = new Map();
  private readonly args: CreateSessionArgs;

  constructor(args: CreateSessionArgs) {
    this.args = args;
  }

  private getModel(generationTask?: GenerationTask): Model {
    const models = this.args.models;
    switch (generationTask) {
      case 'function_calling':
        return models?.function_calling || { name: 'onnx-community/Qwen3-0.6B-ONNX', quantization: 'q4f16' };
      case 'planning':
        return models?.planning || { name: 'onnx-community/Qwen3-0.6B-ONNX', quantization: 'q4f16' };
      case 'reasoning':
        return models?.reasoning || { name: 'onnx-community/Qwen3-0.6B-ONNX', quantization: 'q4f16' };
      case 'chat':
      default:
        return models?.chat || { name: 'onnx-community/Qwen3-0.6B-ONNX', quantization: 'q4f16' };
    }
  }

  private createWorkerInstance(model: Model): WorkerInstance {
    const worker = new Worker(new URL('./runtime/worker.js', import.meta.url), { type: 'module' });
    return {
      worker,
      model,
      initialized: false,
      disposed: false,
      inflightId: 0,
    };
  }

  private nextId(workerInstance: WorkerInstance): string {
    workerInstance.inflightId += 1;
    return String(workerInstance.inflightId);
  }

  private once<T = unknown>(workerInstance: WorkerInstance, requestId: string, filter?: (m: any) => boolean): Promise<T> {
    return new Promise((resolve, reject) => {
      const onMessage = (ev: MessageEvent<any>) => {
        const msg = ev.data;
        if (!msg || msg.requestId !== requestId) return;
        if (filter && !filter(msg)) return;
        workerInstance.worker.removeEventListener('message', onMessage as any);
        workerInstance.worker.removeEventListener('error', onError as any);
        if (msg.type === 'error') reject(new Error(msg.error));
        else resolve(msg);
      };
      const onError = (e: ErrorEvent) => {
        workerInstance.worker.removeEventListener('message', onMessage as any);
        workerInstance.worker.removeEventListener('error', onError as any);
        reject(e.error || new Error(e.message));
      };
      workerInstance.worker.addEventListener('message', onMessage as any);
      workerInstance.worker.addEventListener('error', onError as any);
    });
  }

  async getWorker(args: GenerateArgs, generationTask?: GenerationTask): Promise<WorkerInstance> {
    // Determine model to use based on generation task or provided model
    let model: Model = args.model || this.getModel(generationTask);
    let workerInstance = this.workers.get(model.name);
    
    if (!workerInstance) {
      // Assign worker instance to model
      logger.workerManager.info('Creating new worker instance', { model });
      workerInstance = this.createWorkerInstance(model);
      this.workers.set(model.name, workerInstance);
    }

    if (!workerInstance.initialized && !workerInstance.disposed) {
      logger.workerManager.debug('Model selected for generation', { model });

      const initId = this.nextId(workerInstance);
      workerInstance.worker.postMessage({
        type: 'init',
        requestId: initId,
        args: {
          model,
          engine: this.args.engine,
          hfToken: this.args.hfToken,
        },
      });
      
      try {
        await this.once(workerInstance, initId);
        workerInstance.initialized = true;
        logger.workerManager.info('Worker initialized successfully', { model });
      } catch (error: any) {
        logger.workerManager.error('Worker initialization failed', { model, error: error.message });
        throw error;
      }
    }
    return workerInstance;
  }

  async disposeAll(): Promise<void> {
    logger.workerManager.info('Disposing all workers', { workerCount: this.workers.size });
    
    const disposePromises: Promise<void>[] = [];

    for (const [modelName, workerInstance] of this.workers) {
      if (!workerInstance.disposed) {
        const disposePromise = this.disposeWorker(workerInstance);
        disposePromises.push(disposePromise);
      }
    }

    await Promise.all(disposePromises);
    this.workers.clear();
    
    logger.workerManager.info('All workers disposed successfully');
  }

  private async disposeWorker(workerInstance: WorkerInstance): Promise<void> {
    if (workerInstance.disposed) return;
    
    workerInstance.disposed = true;
    const requestId = this.nextId(workerInstance);
    
    workerInstance.worker.postMessage({ type: 'dispose', requestId });
    await this.once(workerInstance, requestId).catch(() => {});
    workerInstance.worker.terminate();
  }
}
