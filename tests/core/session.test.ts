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

      // Verify the generator can be created and has the expected API
      const generator = session.generate(generateArgs)
      expect(generator).toBeDefined()
      expect(typeof generator[Symbol.asyncIterator]).toBe('function')
      
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
      
      // Verify generator was created successfully
      expect(generator).toBeDefined()
      
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
      
      // Verify generator was created successfully
      expect(generator).toBeDefined()
      
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
    it('should create async generator for streaming', async () => {
      console.log("Hello testing")

      const session = await createSession()
      
      const generator = session.generate({ prompt: 'test' })
      
      expect(generator).toBeDefined()
      expect(typeof generator[Symbol.asyncIterator]).toBe('function')
      
      await session.dispose()
    })

    it('should handle generation parameters correctly', async () => {
      const session = await createSession()
      const generateArgs = {
        prompt: 'test',
        temperature: 0.7,
        top_p: 0.9,
        stop: ['</s>']
      }
      
      const generator = session.generate(generateArgs)
      expect(generator).toBeDefined()
      
      await session.dispose()
    })
  })
})
