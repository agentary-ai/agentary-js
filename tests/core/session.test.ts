import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSession } from '../../src/core/session'
import type { CreateSessionArgs } from '../../src/types/session'
import type { GenerateArgs, Tool } from '../../src/types/worker'

// Mock the InferenceProviderManager with realistic streaming behavior
vi.mock('../../src/providers/manager', () => {
  return {
    InferenceProviderManager: vi.fn().mockImplementation(() => {
      const providers = new Map()
      
      return {
        registerModels: vi.fn().mockImplementation(async (models: any[]) => {
          // Register each model as a provider
          for (const modelConfig of models) {
            providers.set(modelConfig.model, {
              model: modelConfig.model,
              initialized: true
            })
          }
        }),
        getProvider: vi.fn().mockImplementation(async (model: string) => {
          return {
            getModelName: () => model,
            generate: vi.fn().mockImplementation(async (args: any) => {
              // Return streaming response by default
              return {
                type: 'streaming',
                stream: (async function* () {
                  yield { token: 'Hello', tokenId: 1, isFirst: true, isLast: false, ttfbMs: 100 }
                  yield { token: ' world', tokenId: 2, isFirst: false, isLast: false }
                  yield { token: '', tokenId: -1, isFirst: false, isLast: true }
                })()
              }
            }),
            dispose: vi.fn().mockResolvedValue(undefined),
            isInitialized: () => true
          }
        }),
        disposeAll: vi.fn().mockResolvedValue(undefined),
        getAllProviders: vi.fn().mockReturnValue(providers)
      }
    })
  }
})

describe('Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createSession', () => {
    it('should create session with default configuration', async () => {
      const session = await createSession({})
      
      expect(session).toBeDefined()
      expect(session.createResponse).toBeTypeOf('function')
      expect(session.dispose).toBeTypeOf('function')
    })

    it('should create session with custom model configuration', async () => {
      const config: CreateSessionArgs = {
        models: [{
          name: 'test-model',
          provider: 'webllm',
          config: {
            model: 'test-model',
            quantization: 'q4'
          }
        }]
      }

      const session = await createSession(config)
      
      expect(session).toBeDefined()
      expect(session.createResponse).toBeTypeOf('function')
      expect(session.dispose).toBeTypeOf('function')
    })

    it('should create session with multiple models', async () => {
      const config: CreateSessionArgs = {
        models: [
          {
            name: 'chat-model',
            provider: 'webllm',
            config: {
              model: 'chat-model',
              quantization: 'q4'
            }
          },
          {
            name: 'tool-model',
            provider: 'webllm',
            config: {
              model: 'tool-model',
              quantization: 'q8'
            }
          },
          {
            name: 'reasoning-model',
            provider: 'webllm',
            config: {
              model: 'reasoning-model',
              quantization: 'q4'
            }
          }
        ]
      }

      const session = await createSession(config)
      
      expect(session).toBeDefined()
    })
  })

  describe('Session.createResponse', () => {
    it('should throw error when generating on disposed session', async () => {
      const session = await createSession({})
      await session.dispose()

      await expect(async () => {
        await session.createResponse('test-model', { messages: [{ role: 'user', content: 'test' }] })
      }).rejects.toThrow('Session disposed')
    })

    it('should handle basic generation request', async () => {
      const session = await createSession({})
      const generateArgs: GenerateArgs = {
        messages: [{ role: 'user', content: 'Hello, world!' }]
      }

      // Verify the response can be created and has the expected API
      const response = await session.createResponse('test-model', generateArgs)
      expect(response).toBeDefined()
      expect(response.type).toBe('streaming')
      if (response.type === 'streaming') {
        expect(typeof response.stream[Symbol.asyncIterator]).toBe('function')
      }
      
      await session.dispose()
    })

    it('should handle generation with tools', async () => {
      const session = await createSession({})
      const tools: Tool[] = [{
        type: 'function',
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: {
            type: 'object' as const,
            properties: {
              input: { type: 'string' }
            },
            required: []
          }
        }
      }]

      const generateArgs: GenerateArgs = {
        messages: [{ role: 'user', content: 'Use the test tool' }],
        tools
      }

      const response = await session.createResponse('test-model', generateArgs)
      
      // Verify response was created successfully
      expect(response).toBeDefined()
      
      await session.dispose()
    })

    it('should handle generation parameters', async () => {
      const session = await createSession({})
      const generateArgs: GenerateArgs = {
        messages: [
          { role: 'system', content: 'Test system message' },
          { role: 'user', content: 'Test prompt' }
        ],
        temperature: 0.7,
        top_p: 0.9,
        top_k: 50,
        repetition_penalty: 1.1,
        stop: ['</s>'],
        seed: 42
      }

      const response = await session.createResponse('test-model', generateArgs)
      
      // Verify response was created successfully
      expect(response).toBeDefined()
      
      await session.dispose()
    })
  })

  describe('Session.dispose', () => {
    it('should dispose session successfully', async () => {
      const session = await createSession({})
      
      await expect(session.dispose()).resolves.toBeUndefined()
    })

    it('should be idempotent - multiple dispose calls should not throw', async () => {
      const session = await createSession({})
      
      await session.dispose()
      await expect(session.dispose()).resolves.toBeUndefined()
    })
  })

  describe('Token Streaming', () => {
    it('should stream tokens correctly', async () => {
      const session = await createSession({})
      
      const response = await session.createResponse('test-model', { messages: [{ role: 'user', content: 'test' }] })
      expect(response.type).toBe('streaming')
      
      const chunks: any[] = []
      if (response.type === 'streaming') {
        for await (const chunk of response.stream) {
          chunks.push(chunk)
        }
      }
      
      expect(chunks).toHaveLength(3) // 2 content chunks + 1 done chunk
      expect(chunks[0]).toMatchObject({
        token: 'Hello',
        tokenId: 1,
        isFirst: true,
        isLast: false,
        ttfbMs: 100
      })
      expect(chunks[1]).toMatchObject({
        token: ' world',
        tokenId: 2,
        isFirst: false,
        isLast: false
      })
      expect(chunks[2]).toMatchObject({
        token: '',
        tokenId: -1,
        isFirst: false,
        isLast: true
      })
      
      await session.dispose()
    })

    it('should handle generation parameters correctly', async () => {
      const session = await createSession({})
      const generateArgs = {
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.7,
        top_p: 0.9,
        stop: ['</s>']
      }
      
      const response = await session.createResponse('test-model', generateArgs)
      expect(response).toBeDefined()
      
      await session.dispose()
    })
  })

  describe('Error Handling', () => {
    it('should handle provider errors gracefully', async () => {
      // Override the mock for this specific test to throw an error
      const { InferenceProviderManager } = await import('../../src/providers/manager')
      const MockManager = InferenceProviderManager as any
      
      MockManager.mockImplementationOnce(() => ({
        registerModels: vi.fn().mockResolvedValue(undefined),
        getProvider: vi.fn().mockResolvedValue({
          getModelName: () => 'test-model',
          generate: vi.fn().mockRejectedValue(new Error('Model loading failed')),
          dispose: vi.fn().mockResolvedValue(undefined),
          isInitialized: () => true
        }),
        disposeAll: vi.fn().mockResolvedValue(undefined),
        getAllProviders: vi.fn().mockReturnValue(new Map())
      }))
      
      const session = await createSession({})
      
      await expect(async () => {
        await session.createResponse('test-model', { messages: [{ role: 'user', content: 'test' }] })
      }).rejects.toThrow('Model loading failed')
      
      await session.dispose()
    })

    it('should stream responses correctly', async () => {
      const session = await createSession({})
      const chunks: any[] = []
      
      const response = await session.createResponse('test-model', { messages: [{ role: 'user', content: 'test' }] })
      if (response.type === 'streaming') {
        for await (const chunk of response.stream) {
          chunks.push(chunk)
        }
      }
      
      // Should get all chunks from the stream
      expect(chunks).toHaveLength(3)
      expect(chunks[0].token).toBe('Hello')
      expect(chunks[1].token).toBe(' world')
      expect(chunks[2].isLast).toBe(true)
      
      await session.dispose()
    })
  })

  describe('Concurrent Generations', () => {
    it('should handle multiple concurrent generations', async () => {
      const session = await createSession({})
      
      // Start multiple generations concurrently
      const promise1 = session.createResponse('test-model', { messages: [{ role: 'user', content: 'test1' }] })
      const promise2 = session.createResponse('test-model', { messages: [{ role: 'user', content: 'test2' }] })
      
      const chunks1: any[] = []
      const chunks2: any[] = []
      
      // Collect results concurrently
      await Promise.all([
        (async () => {
          const response = await promise1
          if (response.type === 'streaming') {
            for await (const chunk of response.stream) {
              chunks1.push(chunk)
            }
          }
        })(),
        (async () => {
          const response = await promise2
          if (response.type === 'streaming') {
            for await (const chunk of response.stream) {
              chunks2.push(chunk)
            }
          }
        })()
      ])
      
      // Verify both completed successfully
      expect(chunks1.length).toBeGreaterThan(0)
      expect(chunks2.length).toBeGreaterThan(0)
      
      await session.dispose()
    })
  })

  describe('Memory Management', () => {
    it('should clean up resources after generation', async () => {
      const session = await createSession({})
      
      // Generate and consume all chunks
      const chunks: any[] = []
      const response = await session.createResponse('test-model', { messages: [{ role: 'user', content: 'test' }] })
      if (response.type === 'streaming') {
        for await (const chunk of response.stream) {
          chunks.push(chunk)
        }
      }
      
      // Should have received all chunks
      expect(chunks.length).toBeGreaterThan(0)
      
      await session.dispose()
    })

    it('should handle early termination gracefully', async () => {
      const session = await createSession({})
      
      // Start generation but break early
      const response = await session.createResponse('test-model', { messages: [{ role: 'user', content: 'test' }] })
      
      if (response.type === 'streaming') {
        const iterator = response.stream[Symbol.asyncIterator]()
        
        // Get first chunk then break
        const firstChunk = await iterator.next()
        expect(firstChunk.done).toBe(false)
        
        // Early termination
        await iterator.return?.()
      }
      
      await session.dispose()
    })
  })
})
