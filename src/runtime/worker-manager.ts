import { type CreateSessionArgs, type GenerateArgs, type TaskType } from '../types/api';

export interface WorkerConfig {
  model: string;
  engine?: string;
  hfToken?: string;
  quantization?: any;
}

export interface WorkerInstance {
  worker: Worker;
  taskType: TaskType;
  initialized: boolean;
  disposed: boolean;
  inflightId: number;
}

export class WorkerManager {
  private workers: Map<TaskType, WorkerInstance> = new Map();
  private readonly args: CreateSessionArgs;

  constructor(args: CreateSessionArgs) {
    this.args = args;
  }

  private createWorkerInstance(taskType: TaskType): WorkerInstance {
    const worker = new Worker(new URL('./runtime/worker.js', import.meta.url), { type: 'module' });
    return {
      worker,
      taskType,
      initialized: false,
      disposed: false,
      inflightId: 0,
    };
  }

  private getModelForTaskType(taskType: TaskType): string {
    const models = this.args.models;
    if (taskType === 'function_calling' && models?.function_calling) {
      return models.function_calling;
    }
    return models?.chat || 'onnx-community/gemma-3-270m-it-ONNX';
  }

  private determineTaskType(args: GenerateArgs): TaskType {
    // If tools are provided, use function_calling worker, otherwise use chat worker
    return (args.tools && args.tools.length > 0) ? 'function_calling' : 'chat';
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

  async getWorkerForTask(taskType: TaskType): Promise<WorkerInstance> {
    let workerInstance = this.workers.get(taskType);
    
    if (!workerInstance) {
      workerInstance = this.createWorkerInstance(taskType);
      this.workers.set(taskType, workerInstance);
    }

    if (!workerInstance.initialized && !workerInstance.disposed) {
      const model = this.getModelForTaskType(taskType);
      const initId = this.nextId(workerInstance);
      
      workerInstance.worker.postMessage({
        type: 'init',
        requestId: initId,
        args: {
          model,
          engine: this.args.engine,
          hfToken: this.args.hfToken,
          quantization: this.args.quantization,
        },
      });
      
      await this.once(workerInstance, initId);
      workerInstance.initialized = true;
    }

    return workerInstance;
  }

  async getWorkerForGeneration(args: GenerateArgs): Promise<WorkerInstance> {
    const taskType = this.determineTaskType(args);
    return this.getWorkerForTask(taskType);
  }

  async disposeAll(): Promise<void> {
    const disposePromises: Promise<void>[] = [];

    for (const [taskType, workerInstance] of this.workers) {
      if (!workerInstance.disposed) {
        const disposePromise = this.disposeWorker(workerInstance);
        disposePromises.push(disposePromise);
      }
    }

    await Promise.all(disposePromises);
    this.workers.clear();
  }

  private async disposeWorker(workerInstance: WorkerInstance): Promise<void> {
    if (workerInstance.disposed) return;
    
    workerInstance.disposed = true;
    const requestId = this.nextId(workerInstance);
    
    workerInstance.worker.postMessage({ type: 'dispose', requestId });
    await this.once(workerInstance, requestId).catch(() => {});
    workerInstance.worker.terminate();
  }

  getInitializedWorkers(): TaskType[] {
    const initializedWorkers: TaskType[] = [];
    for (const [taskType, workerInstance] of this.workers) {
      if (workerInstance.initialized && !workerInstance.disposed) {
        initializedWorkers.push(taskType);
      }
    }
    return initializedWorkers;
  }
}
