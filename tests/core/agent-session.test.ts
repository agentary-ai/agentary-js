import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAgentSession } from '../../src/core/agent-session'
import type { Tool } from '../../src/types/worker'
import type { Workflow, WorkflowStep } from '../../src/types/agent-session'
import type { ModelResponse } from '../../src/types/session'

// Mock dependencies
vi.mock('../../src/core/session', () => ({
  createSession: vi.fn().mockResolvedValue({
    createResponse: vi.fn().mockResolvedValue({
      type: 'streaming',
      stream: (async function* () {
        yield { token: 'test', tokenId: 1, isFirst: true, isLast: false }
        yield { token: ' response', tokenId: 2, isFirst: false, isLast: true }
      })()
    }),
    registerModels: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockReturnValue(() => {}),
    off: vi.fn(),
    _eventEmitter: {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn()
    },
    _providerManager: {
      registerModel: vi.fn()
    }
  })
}))

vi.mock('../../src/workflow/executor', () => ({
  WorkflowExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockImplementation(function* () {
      // WorkflowExecutor doesn't yield results for successful workflows
      // It modifies the workflow steps in place
      return []
    })
  }))
}))

vi.mock('../../src/workflow/step-executor', () => ({
  StepExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue(undefined)
  }))
}))

describe('AgentSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createAgentSession', () => {
    it('should create agent session with default configuration', async () => {
      const session = await createAgentSession()
      
      expect(session).toBeDefined()
      expect(session.createResponse).toBeTypeOf('function')
      expect(session.dispose).toBeTypeOf('function')
      expect(session.registerTools).toBeTypeOf('function')
      expect(session.getRegisteredTools).toBeTypeOf('function')
      expect(session.runWorkflow).toBeTypeOf('function')
      expect(session._eventEmitter).toBeDefined()
      expect(session._providerManager).toBeDefined()
    })

    it('should create agent session with custom configuration', async () => {
      const config = {
        models: [{
          name: 'test-model',
          provider: 'webllm',
          config: {
            model: 'test-model',
            quantization: 'q4' as const
          }
        }]
      }

      const session = await createAgentSession(config)
      expect(session).toBeDefined()
    })
  })

  describe('Tool Management', () => {
    it('should register and retrieve tools', async () => {
      const session = await createAgentSession()
      
      const tool: Tool = {
        type: 'function',
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              input: { type: 'string' }
            }
          },
          implementation: async (args) => ({ result: `Processed: ${args.input}` })
        }
      }

      session.registerTools([tool])
      
      const registeredTools = session.getRegisteredTools()
      expect(registeredTools).toHaveLength(1)
      expect(registeredTools[0]).toEqual(tool)
    })

    it('should register multiple tools', async () => {
      const session = await createAgentSession()
      
      const tool1: Tool = {
        type: 'function',
        function: {
          name: 'tool1',
          description: 'First tool',
          parameters: { type: 'object' },
          implementation: async () => ({ result: 'Tool 1' })
        }
      }

      const tool2: Tool = {
        type: 'function',
        function: {
          name: 'tool2',
          description: 'Second tool',
          parameters: { type: 'object' },
          implementation: async () => ({ result: 'Tool 2' })
        }
      }

      session.registerTools([tool1, tool2])
      
      const registeredTools = session.getRegisteredTools()
      expect(registeredTools).toHaveLength(2)
      expect(registeredTools.map(t => t.function.name)).toEqual(['tool1', 'tool2'])
    })

    it('should throw error when registering tools on disposed session', async () => {
      const session = await createAgentSession()
      await session.dispose()

      const tool: Tool = {
        type: 'function',
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: { type: 'object' },
          implementation: async () => ({ result: 'test' })
        }
      }

      expect(() => session.registerTools([tool])).toThrow('Agent session disposed')
    })
  })

  describe('Generation with Tools', () => {
    it('should call createResponse with correct model parameter', async () => {
      const { createSession } = await import('../../src/core/session')
      const mockCreateSession = createSession as any
      
      // Create a custom mock session for this test
      const mockSession = {
        createResponse: vi.fn().mockResolvedValue({
          type: 'streaming',
          stream: (async function* () {
            yield { token: 'Using', tokenId: 1, isFirst: true, isLast: false }
            yield { token: ' tools', tokenId: 2, isFirst: false, isLast: true }
          })()
        }),
        registerModels: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockResolvedValue(undefined),
        on: vi.fn().mockReturnValue(() => {}),
        off: vi.fn(),
        _eventEmitter: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
        _providerManager: { registerModel: vi.fn() }
      }
      
      mockCreateSession.mockResolvedValueOnce(mockSession)

      const session = await createAgentSession()
      
      const tool: Tool = {
        type: 'function',
        function: {
          name: 'calculator',
          description: 'Performs calculations',
          parameters: {
            type: 'object',
            properties: {
              expression: { type: 'string' }
            }
          },
          implementation: async (args) => ({ result: eval(args.expression) })
        }
      }

      session.registerTools([tool])

      const response = await session.createResponse('test-model', { 
        messages: [{ role: 'user', content: 'Calculate 2+2' }] 
      })
      
      expect(response.type).toBe('streaming')
      expect(mockSession.createResponse).toHaveBeenCalledWith(
        'test-model',
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Calculate 2+2' }]
        })
      )
    })

    it('should allow tools to be registered for workflow use', async () => {
      const session = await createAgentSession()
      
      const tool: Tool = {
        type: 'function',
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: { type: 'object' },
          implementation: async () => ({ result: 'test' })
        }
      }

      session.registerTools([tool])
      
      const registeredTools = session.getRegisteredTools()
      expect(registeredTools).toHaveLength(1)
      expect(registeredTools[0].function.name).toBe('test_tool')
    })
  })

  describe('Workflow Execution', () => {
    it('should execute workflow', async () => {
      const session = await createAgentSession()
      
      const workflow: Workflow = {
        id: 'test-workflow',
        tools: [],
        steps: [
          {
            id: '1',
            prompt: 'First Step - Do something',
            model: 'test-model'
          }
        ]
      }

      const results: any[] = []
      const userPrompt = 'Execute this workflow'
      for await (const result of session.runWorkflow(userPrompt, workflow)) {
        results.push(result)
      }

      // WorkflowExecutor yields results per step execution
      expect(results).toBeDefined()
    })

    it('should throw error when running workflow on disposed session', async () => {
      const session = await createAgentSession()
      await session.dispose()

      const workflow: Workflow = {
        id: 'test-workflow',
        tools: [],
        steps: []
      }

      await expect(async () => {
        for await (const result of session.runWorkflow('test prompt', workflow)) {
          // Should not execute
        }
      }).rejects.toThrow('Agent session disposed')
    })
  })


  describe('Disposal', () => {
    it('should dispose session and clear tools', async () => {
      const { createSession } = await import('../../src/core/session')
      const mockCreateSession = createSession as any
      
      // Create a custom mock session for this test
      const mockSession = {
        createResponse: vi.fn().mockResolvedValue({
          type: 'streaming',
          stream: (async function* () {
            yield { token: 'test', tokenId: 1, isFirst: true, isLast: false }
            yield { token: ' response', tokenId: 2, isFirst: false, isLast: true }
          })()
        }),
        registerModels: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockResolvedValue(undefined),
        on: vi.fn().mockReturnValue(() => {}),
        off: vi.fn(),
        _eventEmitter: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
        _providerManager: { registerModel: vi.fn() }
      }
      
      mockCreateSession.mockResolvedValueOnce(mockSession)
      const session = await createAgentSession()
      
      // Register a tool
      const tool: Tool = {
        type: 'function',
        function: {
          name: 'test_tool',
          description: 'Test tool',
          parameters: { type: 'object' },
          implementation: async () => ({ result: 'test' })
        }
      }
      session.registerTools([tool])
      
      expect(session.getRegisteredTools()).toHaveLength(1)
      
      await session.dispose()
      
      // Verify underlying session was disposed
      expect(mockSession.dispose).toHaveBeenCalled()
      
      // Tools should be cleared (can't verify directly due to disposal)
    })

    it('should be idempotent', async () => {
      const session = await createAgentSession()
      
      await session.dispose()
      await expect(session.dispose()).resolves.toBeUndefined()
    })

    it('should prevent all operations after disposal', async () => {
      const { createSession } = await import('../../src/core/session')
      const mockCreateSession = createSession as any
      
      // Create a custom mock session that simulates disposal behavior
      let sessionDisposed = false
      const mockSession = {
        createResponse: vi.fn().mockImplementation(async () => {
          if (sessionDisposed) {
            throw new Error('Session disposed')
          }
          return {
            type: 'streaming',
            stream: (async function* () {
              yield { token: 'test', tokenId: 1, isFirst: true, isLast: true }
            })()
          }
        }),
        registerModels: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockImplementation(async () => {
          sessionDisposed = true
        }),
        on: vi.fn().mockReturnValue(() => {}),
        off: vi.fn(),
        _eventEmitter: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
        _providerManager: { registerModel: vi.fn() }
      }
      
      mockCreateSession.mockResolvedValueOnce(mockSession)
      
      const session = await createAgentSession()
      await session.dispose()

      // createResponse should now throw since underlying session throws when disposed
      await expect(async () => {
        const response = await session.createResponse('test-model', { messages: [{ role: 'user', content: 'test' }] })
        if (response.type === 'streaming') {
          for await (const chunk of response.stream) {
            // Should not execute
          }
        }
      }).rejects.toThrow('Session disposed')

      // registerTools should throw
      expect(() => session.registerTools([{
        type: 'function',
        function: {
          name: 'test',
          description: 'test',
          parameters: { type: 'object' },
          implementation: async () => ({ result: 'test' })
        }
      }])).toThrow('Agent session disposed')

      // RunWorkflow should throw
      await expect(async () => {
        for await (const result of session.runWorkflow('test prompt', {
          id: 'test',
          tools: [],
          steps: []
        })) {
          // Should not execute
        }
      }).rejects.toThrow('Agent session disposed')
    })
  })

  describe('Tool Management - Edge Cases', () => {
    it('should allow registering multiple tools with different names', async () => {
      const session = await createAgentSession()
      const tool1: Tool = {
        type: 'function',
        function: {
          name: 'tool_one',
          description: 'First tool',
          parameters: { type: 'object' },
          implementation: async () => ({ result: 'one' })
        }
      }
      
      const tool2: Tool = {
        type: 'function',
        function: {
          name: 'tool_two',
          description: 'Second tool',
          parameters: { type: 'object' },
          implementation: async () => ({ result: 'two' })
        }
      }
      
      session.registerTools([tool1])
      session.registerTools([tool2])
      
      const tools = session.getRegisteredTools()
      expect(tools).toHaveLength(2)
      expect(tools.map(t => t.function.name)).toContain('tool_one')
      expect(tools.map(t => t.function.name)).toContain('tool_two')
    })
  })

  describe('Generation Error Handling', () => {
    it('should handle errors from underlying session.createResponse', async () => {
      const { createSession } = await import('../../src/core/session')
      const mockCreateSession = createSession as any
      
      // Create a new mock session with error behavior
      const errorMockSession = {
        createResponse: vi.fn().mockRejectedValue(new Error('Generation failed')),
        registerModels: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockResolvedValue(undefined),
        on: vi.fn().mockReturnValue(() => {}),
        off: vi.fn(),
        _eventEmitter: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
        _providerManager: { registerModel: vi.fn() }
      }
      
      mockCreateSession.mockResolvedValueOnce(errorMockSession)
      
      const session = await createAgentSession()
      
      await expect(async () => {
        await session.createResponse('test-model', { messages: [{ role: 'user', content: 'test' }] })
      }).rejects.toThrow('Generation failed')
    })

    it('should handle empty prompts', async () => {
      const session = await createAgentSession()
      
      const response = await session.createResponse('test-model', { messages: [{ role: 'user', content: '' }] })
      
      // Verify response is returned even with empty prompt
      expect(response).toBeDefined()
      expect(response.type).toBe('streaming')
    })

    it('should allow registering tools that might error', async () => {
      const session = await createAgentSession()
      
      const errorTool: Tool = {
        type: 'function',
        function: {
          name: 'error_tool',
          description: 'Tool that throws',
          parameters: { type: 'object' },
          implementation: async () => {
            throw new Error('Tool execution failed')
          }
        }
      }
      
      // Registration should succeed even if tool might error during execution
      expect(() => session.registerTools([errorTool])).not.toThrow()
      expect(session.getRegisteredTools()).toHaveLength(1)
    })
  })

  describe('Concurrency', () => {
    it('should handle concurrent createResponse calls', async () => {
      const session = await createAgentSession()
      
      const promise1 = session.createResponse('test-model', { messages: [{ role: 'user', content: 'First' }] })
      const promise2 = session.createResponse('test-model', { messages: [{ role: 'user', content: 'Second' }] })
      
      const [result1, result2] = await Promise.all([promise1, promise2])
      expect(result1).toBeDefined()
      expect(result1.type).toBe('streaming')
      expect(result2).toBeDefined()
      expect(result2.type).toBe('streaming')
    })

    it('should handle tool registration during createResponse call', async () => {
      const { createSession } = await import('../../src/core/session')
      const mockCreateSession = createSession as any
      
      // Create a custom mock session for this test
      const mockSession = {
        createResponse: vi.fn().mockImplementation(async (model: string, args: any) => {
          // Simulate async delay
          await new Promise(resolve => setTimeout(resolve, 10))
          return {
            type: 'streaming',
            stream: (async function* () {
              yield { token: 'Done', tokenId: 1, isFirst: true, isLast: true }
            })()
          }
        }),
        registerModels: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockResolvedValue(undefined),
        on: vi.fn().mockReturnValue(() => {}),
        off: vi.fn(),
        _eventEmitter: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
        _providerManager: { registerModel: vi.fn() }
      }
      
      mockCreateSession.mockResolvedValueOnce(mockSession)

      const session = await createAgentSession()
      
      const generatePromise = session.createResponse('test-model', { messages: [{ role: 'user', content: 'test' }] })
      
      // Register tool while generation is in progress
      session.registerTools([{
        type: 'function',
        function: {
          name: 'late_tool',
          description: 'Registered during generation',
          parameters: { type: 'object' },
          implementation: async () => ({ result: 'late' })
        }
      }])
      
      const response = await generatePromise
      
      expect(response).toBeDefined()
      expect(response.type).toBe('streaming')
      // Tool should be registered in session
      expect(session.getRegisteredTools()).toHaveLength(1)
      expect(session.getRegisteredTools()[0].function.name).toBe('late_tool')
    })

    it('should handle concurrent workflow executions', async () => {
      const session = await createAgentSession()
      
      const workflow1: Workflow = {
        id: 'workflow1',
        tools: [],
        steps: [
          {
            id: '1',
            prompt: 'First workflow step',
            model: 'test-model'
          }
        ]
      }

      const workflow2: Workflow = {
        id: 'workflow2',
        tools: [],
        steps: [
          {
            id: '1',
            prompt: 'Second workflow step',
            model: 'test-model'
          }
        ]
      }

      const promise1 = (async () => {
        const results: any[] = []
        for await (const result of session.runWorkflow('First prompt', workflow1)) {
          results.push(result)
        }
        return results
      })()

      const promise2 = (async () => {
        const results: any[] = []
        for await (const result of session.runWorkflow('Second prompt', workflow2)) {
          results.push(result)
        }
        return results
      })()

      const [results1, results2] = await Promise.all([promise1, promise2])
      expect(results1).toBeDefined()
      expect(results2).toBeDefined()
    })
  })

  describe('Property Access', () => {
    it('should expose session event emitter and provider manager', async () => {
      const session = await createAgentSession()
      expect(session._eventEmitter).toBeDefined()
      expect(session._eventEmitter).toHaveProperty('emit')
      expect(session._eventEmitter).toHaveProperty('on')
      expect(session._eventEmitter).toHaveProperty('off')
      expect(session._providerManager).toBeDefined()
    })

    it('should maintain references from underlying session', async () => {
      const { createSession } = await import('../../src/core/session')
      const mockCreateSession = createSession as any
      
      // Create a custom mock session for this test
      const mockEventEmitter = {
        emit: vi.fn(),
        on: vi.fn(),
        off: vi.fn()
      }
      
      const mockProviderManager = {
        registerModel: vi.fn()
      }
      
      const mockSession = {
        createResponse: vi.fn().mockResolvedValue({
          type: 'streaming',
          stream: (async function* () {
            yield { token: 'test', tokenId: 1, isFirst: true, isLast: true }
          })()
        }),
        registerModels: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockResolvedValue(undefined),
        on: vi.fn().mockReturnValue(() => {}),
        off: vi.fn(),
        _eventEmitter: mockEventEmitter,
        _providerManager: mockProviderManager
      }
      
      mockCreateSession.mockResolvedValueOnce(mockSession)
      
      const session = await createAgentSession()
      expect(session._eventEmitter).toBe(mockEventEmitter)
      expect(session._providerManager).toBe(mockProviderManager)
    })
  })

  describe('Error Message Consistency', () => {
    it('should use consistent error message for disposed session', async () => {
      const { createSession } = await import('../../src/core/session')
      const mockCreateSession = createSession as any
      
      // Create a custom mock session that simulates disposal behavior
      let sessionDisposed = false
      const mockSession = {
        createResponse: vi.fn().mockImplementation(async () => {
          if (sessionDisposed) {
            throw new Error('Session disposed')
          }
          return {
            type: 'streaming',
            stream: (async function* () {
              yield { token: 'test', tokenId: 1, isFirst: true, isLast: true }
            })()
          }
        }),
        registerModels: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockImplementation(async () => {
          sessionDisposed = true
        }),
        on: vi.fn().mockReturnValue(() => {}),
        off: vi.fn(),
        _eventEmitter: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
        _providerManager: { registerModel: vi.fn() }
      }
      
      mockCreateSession.mockResolvedValueOnce(mockSession)
      
      const session = await createAgentSession()
      await session.dispose()

      const agentExpectedError = 'Agent session disposed'
      const sessionExpectedError = 'Session disposed'

      // Check registerTools throws AgentSession error 
      expect(() => session.registerTools([{
        type: 'function',
        function: {
          name: 'test',
          description: 'test',
          parameters: { type: 'object' },
          implementation: async () => ({ result: 'test' })
        }
      }])).toThrowError(agentExpectedError)

      // createResponse throws underlying Session error
      await expect(async () => {
        await session.createResponse('test-model', { messages: [{ role: 'user', content: 'test' }] })
      }).rejects.toThrowError(sessionExpectedError)

      // runWorkflow throws AgentSession error
      await expect(async () => {
        for await (const result of session.runWorkflow('test prompt', {
          id: 'test',
          tools: [],
          steps: []
        })) {
          // Should not execute
        }
      }).rejects.toThrowError(agentExpectedError)
    })
  })
})
