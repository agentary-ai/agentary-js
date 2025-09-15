import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSession } from '../../src/core/session'
import type { CreateSessionArgs, GenerateArgs } from '../../src/types/api'

// Mock the WorkerManager with more realistic behavior
vi.mock('../../src/workers/manager', () => {
  // Store message handlers to simulate worker communication
  const messageHandlers: Map<any, (ev: MessageEvent) => void> = new Map()
  
  const createMockWorkerInstance = () => {
    const mockWorker = {
      postMessage: vi.fn().mockImplementation((msg: any) => {
        // Simulate async worker response
        if (msg.type === 'generate') {
          setTimeout(() => {
            const handler = messageHandlers.get(mockWorker)
            if (handler) {
              // Send initial chunk
              handler({ data: { 
                type: 'chunk', 
                requestId: msg.requestId,
                payload: { token: 'Hello', tokenId: 1, isFirst: true, isLast: false, ttfbMs: 100 }
              }} as MessageEvent)
              
              // Send middle chunk
              handler({ data: { 
                type: 'chunk', 
                requestId: msg.requestId,
                payload: { token: ' world', tokenId: 2, isFirst: false, isLast: false }
              }} as MessageEvent)
              
              // Send done
              handler({ data: { 
                type: 'done', 
                requestId: msg.requestId 
              }} as MessageEvent)
            }
          }, 10)
        }
      }),
      addEventListener: vi.fn().mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandlers.set(mockWorker, handler)
        }
      }),
      removeEventListener: vi.fn().mockImplementation((event: string, handler: any) => {
        if (event === 'message') {
          messageHandlers.delete(mockWorker)
        }
      }),
      terminate: vi.fn()
    }
    
    return {
      worker: mockWorker,
      inflightId: 0,
      disposed: false
    }
  }

  return {
    WorkerManager: vi.fn().mockImplementation(() => ({
      getWorkerForGeneration: vi.fn().mockResolvedValue(createMockWorkerInstance()),
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
    it('should stream tokens correctly', async () => {
      const session = await createSession()
      
      const chunks: any[] = []
      for await (const chunk of session.generate({ prompt: 'test' })) {
        chunks.push(chunk)
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

  describe('Error Handling', () => {
    it('should handle worker errors gracefully', async () => {
      // Store the event handler for later use
      let messageHandler: ((ev: MessageEvent) => void) | null = null
      
      // Create error worker instance
      const errorWorkerInstance = {
        worker: {
          postMessage: vi.fn().mockImplementation((msg: any) => {
            if (msg.type === 'generate') {
              setTimeout(() => {
                if (messageHandler) {
                  messageHandler({ data: { 
                    type: 'error', 
                    requestId: msg.requestId,
                    error: 'Worker error: Model loading failed'
                  }} as MessageEvent)
                }
              }, 10)
            }
          }),
          addEventListener: vi.fn().mockImplementation((event: string, handler: any) => {
            if (event === 'message') {
              messageHandler = handler
            }
          }),
          removeEventListener: vi.fn().mockImplementation(() => {
            messageHandler = null
          }),
          terminate: vi.fn()
        },
        inflightId: 0,
        disposed: false
      }
      
      // Override the mock for this specific test
      const WorkerManager = (await import('../../src/workers/manager')).WorkerManager as any
      WorkerManager.mockImplementationOnce(() => ({
        getWorkerForGeneration: vi.fn().mockResolvedValue(errorWorkerInstance),
        disposeAll: vi.fn().mockResolvedValue(undefined)
      }))
      
      const session = await createSession()
      const chunks: any[] = []
      
      for await (const chunk of session.generate({ prompt: 'test' })) {
        chunks.push(chunk)
      }
      
      // Should receive an error chunk
      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toMatchObject({
        token: '',
        tokenId: -1,
        isFirst: false,
        isLast: true
      })
      
      await session.dispose()
    })

    it('should handle debug messages from worker', async () => {
      // Store the event handler
      let messageHandler: ((ev: MessageEvent) => void) | null = null
      
      const debugWorkerInstance = {
        worker: {
          postMessage: vi.fn().mockImplementation((msg: any) => {
            if (msg.type === 'generate') {
              setTimeout(() => {
                if (messageHandler) {
                  // Send debug message
                  messageHandler({ data: { 
                    type: 'debug', 
                    requestId: msg.requestId,
                    payload: { message: 'Model loaded successfully' }
                  }} as MessageEvent)
                  // Then send normal chunks
                  messageHandler({ data: { 
                    type: 'chunk', 
                    requestId: msg.requestId,
                    payload: { token: 'Test', tokenId: 1, isFirst: true, isLast: false }
                  }} as MessageEvent)
                  messageHandler({ data: { 
                    type: 'done', 
                    requestId: msg.requestId 
                  }} as MessageEvent)
                }
              }, 10)
            }
          }),
          addEventListener: vi.fn().mockImplementation((event: string, handler: any) => {
            if (event === 'message') {
              messageHandler = handler
            }
          }),
          removeEventListener: vi.fn().mockImplementation(() => {
            messageHandler = null
          }),
          terminate: vi.fn()
        },
        inflightId: 0,
        disposed: false
      }
      
      // Override the mock for this test
      const WorkerManager = (await import('../../src/workers/manager')).WorkerManager as any
      WorkerManager.mockImplementationOnce(() => ({
        getWorkerForGeneration: vi.fn().mockResolvedValue(debugWorkerInstance),
        disposeAll: vi.fn().mockResolvedValue(undefined)
      }))
      
      const session = await createSession()
      const chunks: any[] = []
      
      for await (const chunk of session.generate({ prompt: 'test' })) {
        chunks.push(chunk)
      }
      
      // Debug messages should not appear in the stream
      expect(chunks).toHaveLength(2)
      expect(chunks[0].token).toBe('Test')
      
      await session.dispose()
    })
  })

  describe('Concurrent Generations', () => {
    it('should handle multiple concurrent generations', async () => {
      // Track all created workers to ensure they all respond
      const workers: any[] = []
      
      // Override the mock to track workers
      const WorkerManager = (await import('../../src/workers/manager')).WorkerManager as any
      WorkerManager.mockImplementationOnce(() => ({
        getWorkerForGeneration: vi.fn().mockImplementation(() => {
          const messageHandlers = new Map()
          const worker = {
            postMessage: vi.fn().mockImplementation((msg: any) => {
              if (msg.type === 'generate') {
                // Use setImmediate or setTimeout to ensure async behavior
                setTimeout(() => {
                  const handler = messageHandlers.get('message')
                  if (handler) {
                    // Send unique content based on the prompt to verify correct routing
                    const prefix = msg.args.prompt === 'test1' ? 'First' : 'Second'
                    
                    handler({ data: { 
                      type: 'chunk', 
                      requestId: msg.requestId,
                      payload: { token: `${prefix} response`, tokenId: 1, isFirst: true, isLast: false }
                    }})
                    
                    handler({ data: { 
                      type: 'done', 
                      requestId: msg.requestId 
                    }})
                  }
                }, 0)
              }
            }),
            addEventListener: vi.fn().mockImplementation((event: string, handler: any) => {
              messageHandlers.set(event, handler)
            }),
            removeEventListener: vi.fn().mockImplementation((event: string) => {
              messageHandlers.delete(event)
            }),
            terminate: vi.fn()
          }
          
          const instance = {
            worker,
            inflightId: 0,
            disposed: false
          }
          
          workers.push(instance)
          return instance
        }),
        disposeAll: vi.fn().mockResolvedValue(undefined)
      }))
      
      const session = await createSession()
      
      // Start multiple generations concurrently
      const gen1 = session.generate({ prompt: 'test1' })
      const gen2 = session.generate({ prompt: 'test2' })
      
      const chunks1: any[] = []
      const chunks2: any[] = []
      
      // Collect results concurrently with timeout protection
      await Promise.all([
        (async () => {
          for await (const chunk of gen1) {
            chunks1.push(chunk)
          }
        })(),
        (async () => {
          for await (const chunk of gen2) {
            chunks2.push(chunk)
          }
        })()
      ])
      
      // Verify both completed
      expect(chunks1.length).toBe(2) // chunk + done
      expect(chunks2.length).toBe(2) // chunk + done
      
      // Verify correct content routing
      expect(chunks1[0].token).toBe('First response')
      expect(chunks2[0].token).toBe('Second response')
      
      // Verify we created two workers
      expect(workers).toHaveLength(2)
      
      await session.dispose()
    }, 15000) // Increase timeout for safety
  })

  describe('Memory Management', () => {
    it('should clean up event listeners after generation', async () => {
      const session = await createSession()
      const WorkerManager = (await import('../../src/workers/manager')).WorkerManager as any
      const mockInstance = WorkerManager.mock.results[0].value
      const workerInstance = await mockInstance.getWorkerForGeneration()
      
      // Clear previous calls
      workerInstance.worker.addEventListener.mockClear()
      workerInstance.worker.removeEventListener.mockClear()
      
      // Generate and consume all chunks
      const chunks: any[] = []
      for await (const chunk of session.generate({ prompt: 'test' })) {
        chunks.push(chunk)
      }
      
      // Event listener should be added once and removed once
      expect(workerInstance.worker.addEventListener).toHaveBeenCalledTimes(1)
      expect(workerInstance.worker.removeEventListener).toHaveBeenCalledTimes(1)
      expect(workerInstance.worker.addEventListener.mock.calls[0][0]).toBe('message')
      expect(workerInstance.worker.removeEventListener.mock.calls[0][0]).toBe('message')
      
      await session.dispose()
    })

    it('should clean up on early termination', async () => {
      const session = await createSession()
      const WorkerManager = (await import('../../src/workers/manager')).WorkerManager as any
      const mockInstance = WorkerManager.mock.results[0].value
      const workerInstance = await mockInstance.getWorkerForGeneration()
      
      // Clear previous calls
      workerInstance.worker.removeEventListener.mockClear()
      
      // Start generation but break early
      const generator = session.generate({ prompt: 'test' })
      const iterator = generator[Symbol.asyncIterator]()
      
      // Get first chunk then break
      await iterator.next()
      await iterator.return?.() // Early termination
      
      // Event listener should still be cleaned up
      expect(workerInstance.worker.removeEventListener).toHaveBeenCalled()
      
      await session.dispose()
    })
  })
})
