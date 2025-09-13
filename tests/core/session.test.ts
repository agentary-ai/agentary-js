import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSession } from '../../src/core/session'
import type { CreateSessionArgs, GenerateArgs } from '../../src/types/api'

// Mock the WorkerManager
vi.mock('../../src/workers/manager', () => {
  const mockWorkerInstance = {
    worker: {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      terminate: vi.fn()
    },
    inflightId: 0,
    disposed: false
  }

  return {
    WorkerManager: vi.fn().mockImplementation(() => ({
      getWorkerForGeneration: vi.fn().mockResolvedValue(mockWorkerInstance),
      disposeAll: vi.fn().mockResolvedValue(undefined)
    }))
  }
})

describe('Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createSession', () => {
    it('should create session with default configuration', async () => {
      const session = await createSession()
      
      expect(session).toBeDefined()
      expect(session.generate).toBeTypeOf('function')
      expect(session.dispose).toBeTypeOf('function')
    })

    it('should create session with custom model configuration', async () => {
      const config: CreateSessionArgs = {
        models: {
          chat: {
            name: 'test-model',
            quantization: 'q4'
          }
        },
        engine: 'webgpu'
      }

      const session = await createSession(config)
      
      expect(session).toBeDefined()
      expect(session.generate).toBeTypeOf('function')
      expect(session.dispose).toBeTypeOf('function')
    })

    it('should create session with multiple models', async () => {
      const config: CreateSessionArgs = {
        models: {
          chat: {
            name: 'chat-model',
            quantization: 'q4'
          },
          function_calling: {
            name: 'function-model',
            quantization: 'q8'
          },
          planning: {
            name: 'planning-model',
            quantization: 'q4'
          }
        }
      }

      const session = await createSession(config)
      
      expect(session).toBeDefined()
    })
  })

  describe('Session.generate', () => {
    it('should throw error when generating on disposed session', async () => {
      const session = await createSession()
      await session.dispose()

      await expect(async () => {
        for await (const chunk of session.generate({ prompt: 'test' })) {
          // This should not execute
        }
      }).rejects.toThrow('Session disposed')
    })

    it('should handle basic generation request', async () => {
      const session = await createSession()
      const generateArgs: GenerateArgs = {
        prompt: 'Hello, world!'
      }

      // Mock worker response
      const mockWorker = vi.mocked((session as any).workerManager.getWorkerForGeneration).mock.results[0].value.worker
      
      // Set up async iteration test
      const generator = session.generate(generateArgs)
      const iteratorPromise = generator.next()

      // Simulate worker message
      const messageHandler = mockWorker.addEventListener.mock.calls.find(call => call[0] === 'message')?.[1]
      if (messageHandler) {
        messageHandler({
          data: {
            type: 'chunk',
            requestId: '1',
            payload: {
              token: 'Hello',
              tokenId: 1,
              isFirst: true,
              isLast: false,
              ttfbMs: 100
            }
          }
        })
      }

      const result = await iteratorPromise
      expect(result.done).toBe(false)
      
      await session.dispose()
    })

    it('should handle generation with tools', async () => {
      const session = await createSession()
      const tools = [{
        type: 'function' as const,
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              input: { type: 'string' }
            }
          }
        }
      }]

      const generateArgs: GenerateArgs = {
        prompt: 'Use the test tool',
        tools
      }

      const generator = session.generate(generateArgs)
      
      // Verify that tools are passed to worker
      expect(vi.mocked((session as any).workerManager.getWorkerForGeneration)).toHaveBeenCalledWith(generateArgs)
      
      await session.dispose()
    })

    it('should handle generation parameters', async () => {
      const session = await createSession()
      const generateArgs: GenerateArgs = {
        prompt: 'Test prompt',
        system: 'Test system message',
        temperature: 0.7,
        top_p: 0.9,
        top_k: 50,
        repetition_penalty: 1.1,
        stop: ['</s>'],
        seed: 42
      }

      const generator = session.generate(generateArgs)
      
      // Verify that parameters are passed correctly
      expect(vi.mocked((session as any).workerManager.getWorkerForGeneration)).toHaveBeenCalledWith(generateArgs)
      
      await session.dispose()
    })
  })

  describe('Session.dispose', () => {
    it('should dispose session successfully', async () => {
      const session = await createSession()
      
      await expect(session.dispose()).resolves.toBeUndefined()
    })

    it('should be idempotent - multiple dispose calls should not throw', async () => {
      const session = await createSession()
      
      await session.dispose()
      await expect(session.dispose()).resolves.toBeUndefined()
    })
  })

  describe('Token Streaming', () => {
    it('should handle token stream with TTFB metrics', async () => {
      const session = await createSession()
      const mockWorker = vi.mocked((session as any).workerManager.getWorkerForGeneration).mock.results[0].value.worker
      
      const generator = session.generate({ prompt: 'test' })
      const chunks: any[] = []
      
      // Simulate async iteration
      const collectChunks = async () => {
        for await (const chunk of generator) {
          chunks.push(chunk)
        }
      }
      
      const collectionPromise = collectChunks()
      
      // Simulate worker messages
      const messageHandler = mockWorker.addEventListener.mock.calls.find(call => call[0] === 'message')?.[1]
      if (messageHandler) {
        // First token with TTFB
        messageHandler({
          data: {
            type: 'chunk',
            requestId: '1',
            payload: {
              token: 'Hello',
              tokenId: 1,
              isFirst: true,
              isLast: false,
              ttfbMs: 150
            }
          }
        })
        
        // Second token
        messageHandler({
          data: {
            type: 'chunk',
            requestId: '1',
            payload: {
              token: ' world',
              tokenId: 2,
              isFirst: false,
              isLast: false
            }
          }
        })
        
        // Done message
        messageHandler({
          data: {
            type: 'done',
            requestId: '1'
          }
        })
      }
      
      await collectionPromise
      
      expect(chunks).toHaveLength(3) // 2 tokens + 1 done marker
      expect(chunks[0]).toMatchObject({
        token: 'Hello',
        isFirst: true,
        ttfbMs: 150
      })
      expect(chunks[1]).toMatchObject({
        token: ' world',
        isFirst: false
      })
      expect(chunks[2]).toMatchObject({
        isLast: true
      })
      
      await session.dispose()
    })

    it('should handle worker errors gracefully', async () => {
      const session = await createSession()
      const mockWorker = vi.mocked((session as any).workerManager.getWorkerForGeneration).mock.results[0].value.worker
      
      const generator = session.generate({ prompt: 'test' })
      const chunks: any[] = []
      
      const collectChunks = async () => {
        for await (const chunk of generator) {
          chunks.push(chunk)
        }
      }
      
      const collectionPromise = collectChunks()
      
      // Simulate error message
      const messageHandler = mockWorker.addEventListener.mock.calls.find(call => call[0] === 'message')?.[1]
      if (messageHandler) {
        messageHandler({
          data: {
            type: 'error',
            requestId: '1',
            error: 'Test error'
          }
        })
      }
      
      await collectionPromise
      
      expect(chunks).toHaveLength(1) // Error results in done marker
      expect(chunks[0]).toMatchObject({
        isLast: true
      })
      
      await session.dispose()
    })
  })
})
