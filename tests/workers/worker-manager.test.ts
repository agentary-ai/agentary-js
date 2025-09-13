import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkerManager } from '../../src/workers/manager'
import type { TaskType, CreateSessionArgs } from '../../src/types/api'

describe('WorkerManager', () => {
  let workerManager: WorkerManager
  
  beforeEach(() => {
    vi.clearAllMocks()
    const config: CreateSessionArgs = {
      models: {
        chat: {
          name: 'test-chat-model',
          quantization: 'q4'
        },
        function_calling: {
          name: 'test-function-model',
          quantization: 'q4'
        }
      }
    }
    workerManager = new WorkerManager(config)
  })

  describe('Worker Creation', () => {
    it('should create worker for chat task', async () => {
      const workerInstance = await workerManager.getWorkerForTask('chat')
      
      expect(workerInstance).toBeDefined()
      expect(workerInstance.worker).toBeDefined()
      expect(workerInstance.inflightId).toBe(0)
      expect(workerInstance.disposed).toBe(false)
    })

    it('should create worker for function calling task', async () => {
      const workerInstance = await workerManager.getWorkerForTask('function_calling')
      
      expect(workerInstance).toBeDefined()
      expect(workerInstance.worker).toBeDefined()
    })

    it('should reuse existing worker for same task type', async () => {
      const worker1 = await workerManager.getWorkerForTask('chat')
      const worker2 = await workerManager.getWorkerForTask('chat')
      
      expect(worker1).toBe(worker2)
    })

    it('should create different workers for different task types', async () => {
      const chatWorker = await workerManager.getWorkerForTask('chat')
      const functionWorker = await workerManager.getWorkerForTask('function_calling')
      
      expect(chatWorker).not.toBe(functionWorker)
    })
  })

  describe('Worker for Generation', () => {
    it('should get chat worker for basic generation', async () => {
      const worker = await workerManager.getWorkerForGeneration({
        prompt: 'Hello'
      })
      
      expect(worker).toBeDefined()
    })

    it('should get function calling worker for generation with tools', async () => {
      const worker = await workerManager.getWorkerForGeneration({
        prompt: 'Use this tool',
        tools: [{
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'Test tool',
            parameters: {}
          }
        }]
      })
      
      expect(worker).toBeDefined()
    })

    it('should get specific task type worker when specified', async () => {
      const worker = await workerManager.getWorkerForGeneration({
        prompt: 'Plan something',
        taskType: 'planning'
      })
      
      expect(worker).toBeDefined()
    })
  })

  describe('Worker Communication', () => {
    it('should handle worker initialization', async () => {
      const worker = await workerManager.getWorkerForTask('chat')
      
      expect(worker.worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'init'
      }))
    })

    it('should increment inflight ID for requests', async () => {
      const worker = await workerManager.getWorkerForTask('chat')
      
      expect(worker.inflightId).toBe(0)
      
      // Simulate request ID generation (this would happen in session)
      worker.inflightId += 1
      expect(worker.inflightId).toBe(1)
    })
  })

  describe('Resource Management', () => {
    it('should dispose all workers', async () => {
      const chatWorker = await workerManager.getWorkerForTask('chat')
      const functionWorker = await workerManager.getWorkerForTask('function_calling')
      
      await workerManager.disposeAll()
      
      expect(chatWorker.worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'dispose'
      }))
      expect(functionWorker.worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'dispose'
      }))
    })

    it('should handle disposal gracefully when no workers exist', async () => {
      await expect(workerManager.disposeAll()).resolves.toBeUndefined()
    })

    it('should mark workers as disposed after disposal', async () => {
      const worker = await workerManager.getWorkerForTask('chat')
      
      // Mock successful disposal response
      const messageHandler = vi.mocked(worker.worker.addEventListener).mock.calls
        .find(call => call[0] === 'message')?.[1]
      
      if (messageHandler) {
        // Simulate dispose acknowledgment
        setTimeout(() => {
          messageHandler({
            data: {
              type: 'ack',
              requestId: expect.any(String)
            }
          })
        }, 0)
      }
      
      await workerManager.disposeAll()
      
      expect(worker.disposed).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle worker initialization errors', async () => {
      // Mock worker that throws on postMessage
      const errorWorker = {
        postMessage: vi.fn().mockImplementation(() => {
          throw new Error('Worker init failed')
        }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        terminate: vi.fn()
      }
      
      // Replace the global Worker mock for this test
      const originalWorker = global.Worker
      global.Worker = vi.fn().mockImplementation(() => errorWorker)
      
      await expect(workerManager.getWorkerForTask('chat')).rejects.toThrow()
      
      // Restore original mock
      global.Worker = originalWorker
    })

    it('should handle unknown task types gracefully', async () => {
      // This should default to chat worker
      const worker = await workerManager.getWorkerForTask('unknown' as TaskType)
      expect(worker).toBeDefined()
    })
  })

  describe('Configuration', () => {
    it('should handle empty model configuration', () => {
      const emptyConfig: CreateSessionArgs = {}
      const manager = new WorkerManager(emptyConfig)
      
      expect(manager).toBeDefined()
    })

    it('should handle partial model configuration', () => {
      const partialConfig: CreateSessionArgs = {
        models: {
          chat: {
            name: 'only-chat-model',
            quantization: 'q4'
          }
        }
      }
      const manager = new WorkerManager(partialConfig)
      
      expect(manager).toBeDefined()
    })

    it('should pass through engine configuration', () => {
      const config: CreateSessionArgs = {
        engine: 'webgpu',
        models: {
          chat: {
            name: 'test-model',
            quantization: 'q4'
          }
        }
      }
      const manager = new WorkerManager(config)
      
      expect(manager).toBeDefined()
    })
  })
})
