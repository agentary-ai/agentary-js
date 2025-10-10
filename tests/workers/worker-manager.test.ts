import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WorkerManager } from '../../src/workers/manager'
import { EventEmitter } from '../../src/utils/event-emitter'
import type { CreateSessionArgs, GenerationTask } from '../../src/types/session'

// Mock Worker to avoid actual worker creation in tests
global.Worker = vi.fn().mockImplementation(() => ({
  postMessage: vi.fn(),
  terminate: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

// Mock URL constructor for worker script
Object.defineProperty(global, 'URL', {
  value: vi.fn().mockImplementation((path: string) => ({ href: path })),
  writable: true
});

describe('WorkerManager', () => {
  let workerManager: WorkerManager;
  let mockSessionArgs: CreateSessionArgs;
  let eventEmitter: EventEmitter;

  beforeEach(() => {
    mockSessionArgs = {
      models: {
        chat: { name: 'test-chat-model', quantization: 'q4' },
        tool_use: { name: 'test-tool-model', quantization: 'q4f16' },
        reasoning: { name: 'test-reasoning-model', quantization: 'q8' }
      },
      engine: 'webgpu',
      ctx: 2048,
      hfToken: 'test-token'
    };
    eventEmitter = new EventEmitter();
    workerManager = new WorkerManager(mockSessionArgs, eventEmitter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Model Selection', () => {
    it('should return correct model for chat task', () => {
      const model = workerManager['getModel']('chat');
      expect(model).toEqual({ name: 'test-chat-model', quantization: 'q4' });
    });

    it('should return correct model for tool_use task', () => {
      const model = workerManager['getModel']('tool_use');
      expect(model).toEqual({ name: 'test-tool-model', quantization: 'q4f16' });
    });

    it('should return correct model for reasoning task', () => {
      const model = workerManager['getModel']('reasoning');
      expect(model).toEqual({ name: 'test-reasoning-model', quantization: 'q8' });
    });

    it('should fallback to default model for undefined task', () => {
      const model = workerManager['getModel'](undefined);
      expect(model).toEqual({ name: 'test-chat-model', quantization: 'q4' });
    });

    it('should fallback to Qwen model when no models configured', () => {
      const emitter = new EventEmitter();
      const managerWithoutModels = new WorkerManager({}, emitter);
      const model = managerWithoutModels['getModel']('chat');
      expect(model.name).toBe('onnx-community/Qwen3-0.6B-ONNX');
      expect(model.quantization).toBe('q4f16');
    });
  });

  describe('Worker Instance Creation', () => {
    it('should create worker instance with correct properties', () => {
      const model = { name: 'test-model', quantization: 'q4' as const };
      const instance = workerManager['createWorkerInstance'](model);
      
      expect(instance.model).toEqual(model);
      expect(instance.initialized).toBe(false);
      expect(instance.disposed).toBe(false);
      expect(instance.inflightId).toBe(0);
      expect(instance.worker).toBeDefined();
    });
  });

  describe('Request ID Generation', () => {
    it('should generate incremental IDs', () => {
      const model = { name: 'test-model', quantization: 'q4' as const };
      const instance = workerManager['createWorkerInstance'](model);
      
      const id1 = workerManager['nextId'](instance);
      const id2 = workerManager['nextId'](instance);
      const id3 = workerManager['nextId'](instance);
      
      expect(id1).toBe('1');
      expect(id2).toBe('2');
      expect(id3).toBe('3');
    });
  });

  describe('Worker Management', () => {
    it('should create new worker for new model', async () => {
      const mockWorker = {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        addEventListener: vi.fn((event, callback) => {
          if (event === 'message') {
            // Simulate successful initialization
            setTimeout(() => callback({ data: { requestId: '1', type: 'init_complete' } }), 0);
          }
        }),
        removeEventListener: vi.fn(),
      };
      
      (global.Worker as any).mockImplementation(() => mockWorker);
      
      const generateArgs = { 
        messages: [{ role: 'user' as const, content: 'test' }] 
      };
      const worker = await workerManager.getWorker(generateArgs, 'chat');
      
      expect(worker).toBeDefined();
      expect(worker.initialized).toBe(true);
      expect(mockWorker.postMessage).toHaveBeenCalledWith({
        type: 'init',
        requestId: '1',
        args: {
          model: { name: 'test-chat-model', quantization: 'q4' },
          engine: 'webgpu',
          hfToken: 'test-token'
        }
      });
    });

    it('should reuse existing initialized worker', async () => {
      const mockWorker = {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        addEventListener: vi.fn((event, callback) => {
          if (event === 'message') {
            setTimeout(() => callback({ data: { requestId: '1', type: 'init_complete' } }), 0);
          }
        }),
        removeEventListener: vi.fn(),
      };
      
      (global.Worker as any).mockImplementation(() => mockWorker);
      
      const generateArgs = { 
        messages: [{ role: 'user' as const, content: 'test' }] 
      };
      
      // First call should initialize
      const worker1 = await workerManager.getWorker(generateArgs, 'chat');
      expect(worker1.initialized).toBe(true);
      
      // Second call should reuse the same worker
      const worker2 = await workerManager.getWorker(generateArgs, 'chat');
      expect(worker2).toBe(worker1);
      expect(mockWorker.postMessage).toHaveBeenCalledTimes(1); // Only one init call
    });
  });

  describe('Worker Disposal', () => {
    it('should dispose all workers', async () => {
      const mockWorkers: any[] = [];
      
      (global.Worker as any).mockImplementation(() => {
        const mockWorker = {
          postMessage: vi.fn(),
          terminate: vi.fn(),
          addEventListener: vi.fn((event, callback) => {
            if (event === 'message') {
              const data = mockWorker.postMessage.mock.calls[mockWorker.postMessage.mock.calls.length - 1][0];
              if (data.type === 'init') {
                setTimeout(() => callback({ data: { requestId: data.requestId, type: 'init_complete' } }), 0);
              } else if (data.type === 'dispose') {
                setTimeout(() => callback({ data: { requestId: data.requestId, type: 'dispose_complete' } }), 0);
              }
            }
          }),
          removeEventListener: vi.fn(),
        };
        mockWorkers.push(mockWorker);
        return mockWorker;
      });
      
      // Create workers for different models
      await workerManager.getWorker({ messages: [{ role: 'user' as const, content: 'test' }] }, 'chat');
      await workerManager.getWorker({ messages: [{ role: 'user' as const, content: 'test' }] }, 'tool_use');
      
      expect(mockWorkers).toHaveLength(2);
      
      // Dispose all workers
      await workerManager.disposeAll();
      
      // Check that all workers were terminated
      mockWorkers.forEach(worker => {
        expect(worker.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'dispose' })
        );
        expect(worker.terminate).toHaveBeenCalled();
      });
    });
  });
});
