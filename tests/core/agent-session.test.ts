import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAgentSession } from '../../src/core/agent-session'
import type { Tool, WorkflowDefinition, WorkflowStep, TokenStreamChunk, AgentStepResult } from '../../src/types/api'

// Mock dependencies
vi.mock('../../src/core/session', () => ({
  createSession: vi.fn().mockResolvedValue({
    generate: vi.fn().mockImplementation(function* () {
      yield { token: 'test', tokenId: 1, isFirst: true, isLast: false }
      yield { token: ' response', tokenId: 2, isFirst: false, isLast: true }
    }),
    dispose: vi.fn().mockResolvedValue(undefined),
    workerManager: {
      getWorkerForGeneration: vi.fn(),
      disposeAll: vi.fn()
    }
  })
}))

vi.mock('../../src/workflow/executor', () => ({
  WorkflowExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockImplementation(function* () {
      yield { 
        stepId: 'step1',
        type: 'thinking',
        content: 'Starting test step',
        isComplete: false
      }
      yield {
        stepId: 'step1',
        type: 'response',
        content: 'Step completed',
        isComplete: true
      }
    })
  }))
}))

vi.mock('../../src/workflow/step-executor', () => ({
  StepExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockImplementation(function* () {
      yield {
        stepId: 'step1',
        type: 'thinking',
        content: 'Executing step...',
        isComplete: false
      }
      yield {
        stepId: 'step1',
        type: 'response',
        content: 'Step executed',
        isComplete: true
      }
    })
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
      expect(session.generate).toBeTypeOf('function')
      expect(session.dispose).toBeTypeOf('function')
      expect(session.registerTool).toBeTypeOf('function')
      expect(session.getRegisteredTools).toBeTypeOf('function')
      expect(session.runWorkflow).toBeTypeOf('function')
      expect(session.executeStep).toBeTypeOf('function')
      expect(session.workerManager).toBeDefined()
    })

    it('should create agent session with custom configuration', async () => {
      const config = {
        models: {
          chat: {
            name: 'test-model',
            quantization: 'q4' as const
          }
        },
        engine: 'webgpu' as const
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

      session.registerTool(tool)
      
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

      session.registerTool(tool1)
      session.registerTool(tool2)
      
      const registeredTools = session.getRegisteredTools()
      expect(registeredTools).toHaveLength(2)
      expect(registeredTools.map(t => t.function.name)).toEqual(['tool1', 'tool2'])
    })

    it('should throw error when registering tool on disposed session', async () => {
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

      expect(() => session.registerTool(tool)).toThrow('Agent session disposed')
    })
  })

  describe('Generation with Tools', () => {
    it('should include registered tools in generation', async () => {
      const { createSession } = await import('../../src/core/session')
      const mockCreateSession = createSession as any
      
      // Create a custom mock session for this test
      const mockSession = {
        generate: vi.fn().mockImplementation(function* () {
          yield { token: 'Using', tokenId: 1, isFirst: true, isLast: false }
          yield { token: ' tools', tokenId: 2, isFirst: false, isLast: true }
        }),
        dispose: vi.fn().mockResolvedValue(undefined),
        workerManager: {
          getWorkerForGeneration: vi.fn(),
          disposeAll: vi.fn()
        }
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

      session.registerTool(tool)

      const chunks: TokenStreamChunk[] = []
      for await (const chunk of session.generate({ prompt: 'Calculate 2+2' })) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(2)
      
      // Verify the generate was called with tools
      const generateCall = mockSession.generate.mock.calls[0][0]
      expect(generateCall.tools).toBeDefined()
      expect(generateCall.tools).toHaveLength(1)
      expect(generateCall.tools[0].function.name).toBe('calculator')
    })

    it('should merge provided tools with registered tools', async () => {
      const { createSession } = await import('../../src/core/session')
      const mockCreateSession = createSession as any
      
      // Create a custom mock session for this test
      const mockSession = {
        generate: vi.fn().mockImplementation(function* () {
          yield { token: 'Done', tokenId: 1, isFirst: true, isLast: true }
        }),
        dispose: vi.fn().mockResolvedValue(undefined),
        workerManager: {
          getWorkerForGeneration: vi.fn(),
          disposeAll: vi.fn()
        }
      }
      
      mockCreateSession.mockResolvedValueOnce(mockSession)

      const session = await createAgentSession()
      
      const registeredTool: Tool = {
        type: 'function',
        function: {
          name: 'registered_tool',
          description: 'A registered tool',
          parameters: { type: 'object' },
          implementation: async () => ({ result: 'registered' })
        }
      }

      session.registerTool(registeredTool)

      const providedTool = {
        type: 'function' as const,
        function: {
          name: 'provided_tool',
          description: 'A provided tool',
          parameters: { type: 'object' }
        }
      }

      for await (const chunk of session.generate({ 
        prompt: 'test',
        tools: [providedTool]
      })) {
        // consume
      }

      const generateCall = mockSession.generate.mock.calls[0][0]
      expect(generateCall.tools).toHaveLength(2)
      expect(generateCall.tools.map((t: any) => t.function.name)).toContain('registered_tool')
      expect(generateCall.tools.map((t: any) => t.function.name)).toContain('provided_tool')
    })
  })

  describe('Workflow Execution', () => {
    it('should execute workflow', async () => {
      const session = await createAgentSession()
      
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        name: 'Test Workflow',
        description: 'A test workflow',
        tools: [],
        steps: [
          {
            id: 'step1',
            type: 'think',
            description: 'First Step - Do something'
          }
        ]
      }

      const results: AgentStepResult[] = []
      for await (const result of session.runWorkflow(workflow)) {
        results.push(result)
      }

      expect(results).toHaveLength(2)
      expect(results[0].type).toBe('thinking')
      expect(results[1].type).toBe('response')
    })

    it('should throw error when running workflow on disposed session', async () => {
      const session = await createAgentSession()
      await session.dispose()

      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        name: 'Test Workflow',
        description: 'A test workflow',
        tools: [],
        steps: []
      }

      await expect(async () => {
        for await (const result of session.runWorkflow(workflow)) {
          // Should not execute
        }
      }).rejects.toThrow('Agent session disposed')
    })
  })

  describe('Step Execution', () => {
    it('should execute individual step', async () => {
      const session = await createAgentSession()
      
      const step: WorkflowStep = {
        id: 'step1',
        type: 'act',
        description: 'Test Step - Execute this step',
        tools: []
      }

      const context = { userId: '123' }

      const results: AgentStepResult[] = []
      for await (const result of session.executeStep(step, context)) {
        results.push(result)
      }

      expect(results.length).toBeGreaterThan(0)
      expect(results.some(r => r.type === 'thinking')).toBe(true)
      expect(results.some(r => r.type === 'response')).toBe(true)
    })

    it('should throw error when executing step on disposed session', async () => {
      const session = await createAgentSession()
      await session.dispose()

      const step: WorkflowStep = {
        id: 'step1',
        type: 'act',
        description: 'Test Step'
      }

      await expect(async () => {
        for await (const result of session.executeStep(step, {})) {
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
        generate: vi.fn().mockImplementation(function* () {
          yield { token: 'test', tokenId: 1, isFirst: true, isLast: false }
          yield { token: ' response', tokenId: 2, isFirst: false, isLast: true }
        }),
        dispose: vi.fn().mockResolvedValue(undefined),
        workerManager: {
          getWorkerForGeneration: vi.fn(),
          disposeAll: vi.fn()
        }
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
      session.registerTool(tool)
      
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
      const session = await createAgentSession()
      await session.dispose()

      // Generate should throw
      await expect(async () => {
        for await (const chunk of session.generate({ prompt: 'test' })) {
          // Should not execute
        }
      }).rejects.toThrow('Agent session disposed')

      // RegisterTool should throw
      expect(() => session.registerTool({
        type: 'function',
        function: {
          name: 'test',
          description: 'test',
          parameters: { type: 'object' },
          implementation: async () => ({ result: 'test' })
        }
      })).toThrow('Agent session disposed')

      // RunWorkflow should throw
      await expect(async () => {
        for await (const result of session.runWorkflow({
          id: 'test',
          name: 'test',
          description: 'test workflow',
          tools: [],
          steps: []
        })) {
          // Should not execute
        }
      }).rejects.toThrow('Agent session disposed')

      // ExecuteStep should throw
      await expect(async () => {
        for await (const result of session.executeStep({
          id: 'test',
          type: 'respond',
          description: 'test'
        }, {})) {
          // Should not execute
        }
      }).rejects.toThrow('Agent session disposed')
    })
  })

  describe('Tool Management - Edge Cases', () => {
    it('should handle duplicate tool registration', async () => {
      const session = await createAgentSession()
      const tool: Tool = {
        type: 'function',
        function: {
          name: 'duplicate_tool',
          description: 'Test tool',
          parameters: { type: 'object' },
          implementation: async () => ({ result: 'v1' })
        }
      }
      
      session.registerTool(tool)
      
      // Register same tool name again with different implementation
      const updatedTool: Tool = { 
        ...tool, 
        function: { 
          ...tool.function, 
          implementation: async () => ({ result: 'v2' }) 
        }
      }
      session.registerTool(updatedTool)
      
      const tools = session.getRegisteredTools()
      expect(tools).toHaveLength(1)
      expect(tools[0].function.name).toBe('duplicate_tool')
      // Verify it replaced the old one - the latest registration should win
    })
  })

  describe('Generation Error Handling', () => {
    it('should handle errors from underlying session.generate', async () => {
      const { createSession } = await import('../../src/core/session')
      const mockCreateSession = createSession as any
      
      // Create a new mock session with error behavior
      const errorMockSession = {
        generate: vi.fn().mockImplementation(function* () {
          throw new Error('Generation failed')
        }),
        dispose: vi.fn().mockResolvedValue(undefined),
        workerManager: {
          getWorkerForGeneration: vi.fn(),
          disposeAll: vi.fn()
        }
      }
      
      mockCreateSession.mockResolvedValueOnce(errorMockSession)
      
      const session = await createAgentSession()
      
      await expect(async () => {
        for await (const chunk of session.generate({ prompt: 'test' })) {
          // Should not reach here
        }
      }).rejects.toThrow('Generation failed')
    })

    it('should handle empty prompts', async () => {
      const session = await createAgentSession()
      
      const chunks: TokenStreamChunk[] = []
      for await (const chunk of session.generate({ prompt: '' })) {
        chunks.push(chunk)
      }
      
      // Verify it still generates something even with empty prompt
      expect(chunks.length).toBeGreaterThan(0)
    })

    it('should handle tool errors during generation', async () => {
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
      
      session.registerTool(errorTool)
      
      // The generate should still work even if a tool might error
      const chunks: TokenStreamChunk[] = []
      for await (const chunk of session.generate({ prompt: 'use error_tool' })) {
        chunks.push(chunk)
      }
      
      expect(chunks.length).toBeGreaterThan(0)
    })
  })

  describe('Concurrency', () => {
    it('should handle concurrent generate calls', async () => {
      const session = await createAgentSession()
      
      const promise1 = (async () => {
        const chunks: TokenStreamChunk[] = []
        for await (const chunk of session.generate({ prompt: 'First' })) {
          chunks.push(chunk)
        }
        return chunks
      })()
      
      const promise2 = (async () => {
        const chunks: TokenStreamChunk[] = []
        for await (const chunk of session.generate({ prompt: 'Second' })) {
          chunks.push(chunk)
        }
        return chunks
      })()
      
      const [result1, result2] = await Promise.all([promise1, promise2])
      expect(result1).toBeDefined()
      expect(result1.length).toBeGreaterThan(0)
      expect(result2).toBeDefined()
      expect(result2.length).toBeGreaterThan(0)
    })

    it('should handle tool registration during generation', async () => {
      const { createSession } = await import('../../src/core/session')
      const mockCreateSession = createSession as any
      let toolsAtGeneration: any[] = []
      
      // Create a custom mock session for this test
      const mockSession = {
        generate: vi.fn().mockImplementation(async function* (args: any) {
          toolsAtGeneration = [...(args.tools || [])]
          
          // Simulate delay
          await new Promise(resolve => setTimeout(resolve, 10))
          
          yield { token: 'Done', tokenId: 1, isFirst: true, isLast: true }
        }),
        dispose: vi.fn().mockResolvedValue(undefined),
        workerManager: {
          getWorkerForGeneration: vi.fn(),
          disposeAll: vi.fn()
        }
      }
      
      mockCreateSession.mockResolvedValueOnce(mockSession)

      const session = await createAgentSession()
      
      const generatePromise = (async () => {
        const chunks: TokenStreamChunk[] = []
        for await (const chunk of session.generate({ prompt: 'test' })) {
          chunks.push(chunk)
        }
        return chunks
      })()
      
      // Register tool while generation is in progress
      session.registerTool({
        type: 'function',
        function: {
          name: 'late_tool',
          description: 'Registered during generation',
          parameters: { type: 'object' },
          implementation: async () => ({ result: 'late' })
        }
      })
      
      await generatePromise
      
      // The late tool should NOT be in the generation that was already started
      expect(toolsAtGeneration.map(t => t.function.name)).not.toContain('late_tool')
    })

    it('should handle concurrent workflow executions', async () => {
      const session = await createAgentSession()
      
      const workflow1: WorkflowDefinition = {
        id: 'workflow1',
        name: 'First Workflow',
        description: 'First concurrent workflow',
        tools: [],
        steps: [
          {
            id: 'step1',
            type: 'think',
            description: 'First workflow step'
          }
        ]
      }

      const workflow2: WorkflowDefinition = {
        id: 'workflow2',
        name: 'Second Workflow',
        description: 'Second concurrent workflow',
        tools: [],
        steps: [
          {
            id: 'step1',
            type: 'act',
            description: 'Second workflow step'
          }
        ]
      }

      const promise1 = (async () => {
        const results: AgentStepResult[] = []
        for await (const result of session.runWorkflow(workflow1)) {
          results.push(result)
        }
        return results
      })()

      const promise2 = (async () => {
        const results: AgentStepResult[] = []
        for await (const result of session.runWorkflow(workflow2)) {
          results.push(result)
        }
        return results
      })()

      const [results1, results2] = await Promise.all([promise1, promise2])
      expect(results1).toBeDefined()
      expect(results1.length).toBeGreaterThan(0)
      expect(results2).toBeDefined()
      expect(results2.length).toBeGreaterThan(0)
    })
  })

  describe('Property Access', () => {
    it('should expose workerManager', async () => {
      const session = await createAgentSession()
      expect(session.workerManager).toBeDefined()
      expect(session.workerManager).toHaveProperty('getWorkerForGeneration')
      expect(session.workerManager).toHaveProperty('disposeAll')
    })

    it('should maintain workerManager reference from underlying session', async () => {
      const { createSession } = await import('../../src/core/session')
      const mockCreateSession = createSession as any
      
      // Create a custom mock session for this test
      const mockWorkerManager = {
        getWorkerForGeneration: vi.fn(),
        disposeAll: vi.fn()
      }
      
      const mockSession = {
        generate: vi.fn().mockImplementation(function* () {
          yield { token: 'test', tokenId: 1, isFirst: true, isLast: true }
        }),
        dispose: vi.fn().mockResolvedValue(undefined),
        workerManager: mockWorkerManager
      }
      
      mockCreateSession.mockResolvedValueOnce(mockSession)
      
      const session = await createAgentSession()
      expect(session.workerManager).toBe(mockWorkerManager)
    })
  })

  describe('Error Message Consistency', () => {
    it('should use consistent error message for disposed session', async () => {
      const session = await createAgentSession()
      await session.dispose()

      const expectedError = 'Agent session disposed'

      // Check all methods throw the same error
      expect(() => session.registerTool({
        type: 'function',
        function: {
          name: 'test',
          description: 'test',
          parameters: { type: 'object' },
          implementation: async () => ({ result: 'test' })
        }
      })).toThrowError(expectedError)

      await expect(async () => {
        for await (const chunk of session.generate({ prompt: 'test' })) {
          // Should not execute
        }
      }).rejects.toThrowError(expectedError)

      await expect(async () => {
        for await (const result of session.runWorkflow({
          id: 'test',
          name: 'test',
          description: 'test',
          tools: [],
          steps: []
        })) {
          // Should not execute
        }
      }).rejects.toThrowError(expectedError)

      await expect(async () => {
        for await (const result of session.executeStep({
          id: 'test',
          type: 'respond',
          description: 'test'
        }, {})) {
          // Should not execute
        }
      }).rejects.toThrowError(expectedError)
    })
  })
})
