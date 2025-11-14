import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkflowExecutor } from '../../src/workflow/executor'
import { StepExecutor } from '../../src/workflow/step-executor'
import { WorkflowStateManager } from '../../src/workflow/workflow-state'
import type { AgentWorkflow, WorkflowStep } from '../../src/types/agent-session'
import type { Tool } from '../../src/types/worker'

// Mock StepExecutor
vi.mock('../../src/workflow/step-executor', () => {
  return {
    StepExecutor: vi.fn().mockImplementation((session) => ({
      execute: vi.fn()
    }))
  }
})

// Mock WorkflowStateManager
vi.mock('../../src/workflow/workflow-state', () => {
  return {
    WorkflowStateManager: vi.fn().mockImplementation(() => ({
      logWorkflowStart: vi.fn(),
      initializeState: vi.fn(),
      getState: vi.fn(),
      findNextStep: vi.fn(),
      isMaxIterationsReached: vi.fn(),
      isTimeout: vi.fn(),
      logWorkflowComplete: vi.fn(),
      getMemoryMetrics: vi.fn().mockReturnValue({
        messageCount: 2,
        estimatedTokens: 100,
        pruneCount: 0,
        avgStepResultSize: 50,
        maxTokenLimit: 1200,
        warningThreshold: 0.8
      }),
      isContextNearLimit: vi.fn().mockReturnValue(false)
    }))
  }
})

describe('WorkflowExecutor', () => {
  let workflowExecutor: WorkflowExecutor
  let mockStepExecutor: any
  let mockStateManager: any
  let mockTools: Tool[]
  let mockSession: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Create mock session object with event emitter
    mockSession = {
      workerManager: vi.fn(),
      createResponse: vi.fn(),
      dispose: vi.fn(),
      _eventEmitter: {
        emit: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        removeAllListeners: vi.fn()
      }
    }
    
    mockStepExecutor = new StepExecutor(mockSession as any, new WorkflowStateManager())
    mockStateManager = new WorkflowStateManager()
    mockTools = []
    workflowExecutor = new WorkflowExecutor(mockStepExecutor, mockTools, mockStateManager, mockSession)
    
    // Setup default mock behavior for WorkflowStateManager
    mockStateManager.getState.mockReturnValue({
      workflow: { id: 'test', name: 'Test', steps: [], tools: [] },
      startTime: Date.now(),
      completedSteps: new Set(),
      iteration: 1,
      maxIterations: 10,
      timeout: 60000,
      tools: []
    })
    mockStateManager.findNextStep.mockReturnValue(null)
    mockStateManager.isMaxIterationsReached.mockReturnValue(false)
    mockStateManager.isTimeout.mockReturnValue(false)
  })

  describe('Simple Linear Workflow', () => {
    it('should execute a basic linear workflow', async () => {
      const workflow: AgentWorkflow = {
        id: 'test-workflow',
        name: 'Test Workflow',
        steps: [
          {
            id: '1',
            description: 'Think about the problem',
            prompt: 'Think about the problem',
            generationTask: 'reasoning'
          },
          {
            id: '2',
            description: 'Provide a response',
            prompt: 'Provide a response',
            generationTask: 'chat'
          }
        ],
        tools: []
      }

      // Setup state manager to return steps in order
      mockStateManager.getState.mockReturnValue({
        workflow,
        startTime: Date.now(),
        completedSteps: new Set(),
        iteration: 1,
        maxIterations: 10,
        timeout: 60000,
        tools: []
      })
      mockStateManager.findNextStep
        .mockReturnValueOnce(workflow.steps[0])
        .mockReturnValueOnce(workflow.steps[1])
        .mockReturnValue(null)

      // Mock step execution - StepExecutor.execute returns WorkflowStepResponse
      mockStepExecutor.execute
        .mockResolvedValueOnce({
          stepId: '1',
          content: 'Thinking about the problem',
          metadata: { stepType: 'reasoning' }
        })
        .mockResolvedValueOnce({
          stepId: '2',
          content: 'Final response',
          metadata: { stepType: 'chat' }
        })

      const results: any[] = []
      const userPrompt = 'Test user prompt'
      for await (const result of workflowExecutor.execute(userPrompt, workflow)) {
        results.push(result)
      }

      // Successful execution yields completed steps
      expect(results).toHaveLength(2)
      expect(mockStepExecutor.execute).toHaveBeenCalledTimes(2)
      
      // Verify steps were completed and yielded
      expect(results[0]).toMatchObject({
        stepId: '1',
        content: 'Thinking about the problem',
        metadata: { stepType: 'reasoning' }
      })
      expect(results[1]).toMatchObject({
        stepId: '2',
        content: 'Final response',
        metadata: { stepType: 'chat' }
      })
      
      // Verify step executor was called with correct parameters
      expect(mockStepExecutor.execute).toHaveBeenCalledWith(workflow.steps[0], [])
      expect(mockStepExecutor.execute).toHaveBeenCalledWith(workflow.steps[1], [])
    })

    it('should pass context between steps', async () => {
      const workflow: AgentWorkflow = {
        id: 'context-workflow',
        name: 'Context Test Workflow',
        steps: [
          {
            id: '1',
            description: 'Analyze the problem',
            prompt: 'Analyze the problem',
            generationTask: 'reasoning'
          },
          {
            id: '2',
            description: 'Provide response based on analysis',
            prompt: 'Provide response based on analysis',
            generationTask: 'chat'
          }
        ],
        tools: []
      }

      // Setup state manager to return steps in order
      mockStateManager.getState.mockReturnValue({
        workflow,
        startTime: Date.now(),
        completedSteps: new Set(),
        iteration: 1,
        maxIterations: 10,
        timeout: 60000,
        tools: []
      })
      mockStateManager.findNextStep
        .mockReturnValueOnce(workflow.steps[0])
        .mockReturnValueOnce(workflow.steps[1])
        .mockReturnValue(null)

      mockStepExecutor.execute
        .mockResolvedValueOnce({
          stepId: '1',
          content: 'Analyzed the problem',
          metadata: { analysis: 'Important data' }
        })
        .mockResolvedValueOnce({
          stepId: '2',
          content: 'Response based on analysis',
          metadata: { stepType: 'chat' }
        })

      const results: any[] = []
      const userPrompt = 'Test user prompt'
      for await (const result of workflowExecutor.execute(userPrompt, workflow)) {
        results.push(result)
      }

      // Successful execution yields completed steps
      expect(results).toHaveLength(2)
      expect(mockStepExecutor.execute).toHaveBeenCalledTimes(2)
      
      // Verify steps were completed and yielded
      expect(results[0]).toMatchObject({
        stepId: '1',
        content: 'Analyzed the problem',
        metadata: { analysis: 'Important data' }
      })
      expect(results[1]).toMatchObject({
        stepId: '2',
        content: 'Response based on analysis',
        metadata: { stepType: 'chat' }
      })
      
      // Verify step executor was called with correct parameters (step and tools)
      expect(mockStepExecutor.execute).toHaveBeenCalledWith(workflow.steps[0], [])
      expect(mockStepExecutor.execute).toHaveBeenCalledWith(workflow.steps[1], [])
    })
  })

  describe('Tool Registration and Usage', () => {
    it('should register workflow tools', async () => {
      const testTool: Tool = {
        type: 'function',
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              input: { type: 'string' }
            },
            required: ['input']
          },
          implementation: vi.fn()
        }
      }

      const workflow: AgentWorkflow = {
        id: 'tool-workflow',
        name: 'Tool Test Workflow',
        steps: [
          {
            id: '1',
            description: 'Use the test tool',
            prompt: 'Use the test tool',
            generationTask: 'tool_use',
            toolChoice: ['test_tool']
          }
        ],
        tools: [testTool]
      }

      // Setup state manager with tools included
      mockStateManager.getState.mockReturnValue({
        workflow,
        startTime: Date.now(),
        completedSteps: new Set(),
        iteration: 1,
        maxIterations: 10,
        timeout: 60000,
        tools: [testTool]
      })
      mockStateManager.findNextStep
        .mockReturnValueOnce(workflow.steps[0])
        .mockReturnValue(null)

      mockStepExecutor.execute.mockResolvedValueOnce({
        stepId: '1',
        content: 'Using test tool',
        toolCall: {
          name: 'test_tool',
          args: { input: 'test' },
          result: 'success'
        },
        metadata: { stepType: 'tool_use' }
      })

      const results: any[] = []
      const userPrompt = 'Test user prompt'
      for await (const result of workflowExecutor.execute(userPrompt, workflow)) {
        results.push(result)
      }

      // Successful execution yields completed step
      expect(results).toHaveLength(1)
      expect(mockStepExecutor.execute).toHaveBeenCalledTimes(1)
      
      // Verify step was completed and yielded
      expect(results[0]).toMatchObject({
        stepId: '1',
        content: 'Using test tool',
        toolCall: expect.objectContaining({
          name: 'test_tool'
        }),
        metadata: { stepType: 'tool_use' }
      })
      
      // Verify step executor was called with the workflow tool
      expect(mockStepExecutor.execute).toHaveBeenCalledWith(
        workflow.steps[0], // step
        [testTool] // tools array
      )
    })
  })

  describe('Step Retry Logic', () => {
    it('should retry failed steps up to maxAttempts', async () => {
      const workflow: AgentWorkflow = {
        id: 'retry-workflow',
        name: 'Retry Test Workflow',
        steps: [
          {
            id: '1',
            description: 'Step that will fail and be retried',
            prompt: 'This step will fail initially',
            generationTask: 'chat',
            maxAttempts: 3
          }
        ],
        tools: []
      }

      // Setup state manager
      mockStateManager.getState.mockReturnValue({
        workflow,
        startTime: Date.now(),
        completedSteps: new Set(),
        iteration: 1,
        maxIterations: 10,
        timeout: 60000,
        tools: []
      })

      // First two calls return the step (for retry), third call returns null (step completed or max attempts reached)
      mockStateManager.findNextStep
        .mockReturnValueOnce(workflow.steps[0])  // First attempt
        .mockReturnValueOnce(workflow.steps[0])  // Second attempt (retry)
        .mockReturnValueOnce(workflow.steps[0])  // Third attempt (retry)
        .mockReturnValue(null)                   // No more steps

      // Mock step execution to fail twice, then succeed
      mockStepExecutor.execute
        .mockResolvedValueOnce({
          stepId: '1',
          error: {
            message: 'First attempt failed'
          },
          metadata: {
            duration: 100,
            stepType: 'chat'
          }
        })
        .mockResolvedValueOnce({
          stepId: '1',
          error: {
            message: 'Second attempt failed'
          },
          metadata: {
            duration: 100,
            stepType: 'chat'
          }
        })
        .mockResolvedValueOnce({
          stepId: '1',
          content: 'Third attempt succeeded',
          metadata: {
            duration: 100,
            stepType: 'chat'
          }
        })

      const results: any[] = []
      const userPrompt = 'Test user prompt'
      for await (const result of workflowExecutor.execute(userPrompt, workflow)) {
        results.push(result)
      }

      // Should have 3 results: 2 failures + 1 success
      expect(results).toHaveLength(3)
      expect(mockStepExecutor.execute).toHaveBeenCalledTimes(3)
      
      // Verify the sequence of results
      expect(results[0]).toMatchObject({
        stepId: '1',
        error: { message: 'First attempt failed' }
      })
      expect(results[1]).toMatchObject({
        stepId: '1',
        error: { message: 'Second attempt failed' }
      })
      expect(results[2]).toMatchObject({
        stepId: '1',
        content: 'Third attempt succeeded'
      })
    })

    it('should stop retrying after maxAttempts is reached', async () => {
      const workflow: AgentWorkflow = {
        id: 'max-retry-workflow',
        name: 'Max Retry Test Workflow',
        steps: [
          {
            id: '1',
            description: 'Step that will always fail',
            prompt: 'This step will always fail',
            generationTask: 'chat',
            maxAttempts: 2
          }
        ],
        tools: []
      }

      // Setup state manager
      mockStateManager.getState.mockReturnValue({
        workflow,
        startTime: Date.now(),
        completedSteps: new Set(),
        iteration: 1,
        maxIterations: 10,
        timeout: 60000,
        tools: []
      })

      // Return the step twice (for 2 attempts), then null
      mockStateManager.findNextStep
        .mockReturnValueOnce(workflow.steps[0])  // First attempt
        .mockReturnValueOnce(workflow.steps[0])  // Second attempt (retry)
        .mockReturnValue(null)                   // No more steps (max attempts reached)

      // Mock step execution to always fail
      mockStepExecutor.execute
        .mockResolvedValueOnce({
          stepId: '1',
          error: {
            message: 'First attempt failed'
          },
          metadata: {
            duration: 100,
            stepType: 'chat'
          }
        })
        .mockResolvedValueOnce({
          stepId: '1',
          error: {
            message: 'Max retries exceeded'
          },
          metadata: {
            duration: 100,
            stepType: 'chat'
          }
        })

      const results: any[] = []
      const userPrompt = 'Test user prompt'
      for await (const result of workflowExecutor.execute(userPrompt, workflow)) {
        results.push(result)
      }

      // Should have 2 results: 1 failure + 1 max retries exceeded
      expect(results).toHaveLength(2)
      expect(mockStepExecutor.execute).toHaveBeenCalledTimes(2)
      
      // Verify the sequence of results
      expect(results[0]).toMatchObject({
        stepId: '1',
        error: { message: 'First attempt failed' }
      })
      expect(results[1]).toMatchObject({
        stepId: '1',
        error: { message: 'Max retries exceeded' }
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle step execution exceptions', async () => {
      const workflow: AgentWorkflow = {
        id: 'error-workflow',
        name: 'Error Workflow',
        steps: [
          {
            id: '1',
            description: 'This step will throw',
            prompt: 'This step will throw',
            generationTask: 'chat'
          }
        ],
        tools: []
      }

      // Setup state manager
      mockStateManager.getState.mockReturnValue({
        workflow,
        startTime: Date.now(),
        completedSteps: new Set(),
        iteration: 1,
        maxIterations: 10,
        timeout: 60000,
        tools: []
      })
      mockStateManager.findNextStep
        .mockReturnValueOnce(workflow.steps[0])
        .mockReturnValue(null)

      mockStepExecutor.execute.mockResolvedValueOnce({
        stepId: '1',
        error: {
          message: 'Step execution failed: Step execution failed'
        },
        metadata: {
          duration: 0,
          stepType: 'chat'
        }
      })

      const results: any[] = []
      const userPrompt = 'Test user prompt'
      for await (const result of workflowExecutor.execute(userPrompt, workflow)) {
        results.push(result)
      }

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        stepId: '1',
        error: {
          message: 'Step execution failed: Step execution failed'
        }
      })
    })

    it.skip('should handle workflow timeout', async () => {
      // Note: Timeout testing is challenging in unit tests due to timing sensitivity
      // The timeout logic is verified to work in integration tests
      const workflow: AgentWorkflow = {
        id: 'timeout-workflow',
        name: 'Timeout Workflow',
        timeout: 1, // 1ms timeout - extremely short
        steps: [
          {
            id: '1',
            description: 'A slow step',
            prompt: 'A slow step',
            generationTask: 'chat'
          }
        ],
        tools: []
      }

      mockStepExecutor.execute.mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, 10)) // 10ms delay
        // This should not complete due to timeout
      })

      const results: any[] = []
      const userPrompt = 'Test user prompt'
      for await (const result of workflowExecutor.execute(userPrompt, workflow)) {
        results.push(result)
      }

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        stepId: '1',
        complete: true,
        response: expect.objectContaining({
          error: 'Workflow timeout exceeded'
        })
      })
    })

    it('should handle maximum iterations exceeded', async () => {
      const workflow: AgentWorkflow = {
        id: 'infinite-workflow',
        name: 'Infinite Workflow',
        maxIterations: 2,
        steps: [
          {
            id: '1',
            description: 'Step 1',
            prompt: 'Step 1',
            generationTask: 'chat'
          },
          {
            id: '2',
            description: 'Step 2',
            prompt: 'Step 2',
            generationTask: 'chat'
          },
          {
            id: '3',
            description: 'Step 3',
            prompt: 'Step 3',
            generationTask: 'chat'
          }
        ],
        tools: []
      }

      const startTime = Date.now()
      // Setup state manager to allow some steps but reach max iterations
      const mockState = {
        workflow,
        startTime,
        completedSteps: new Set(),
        iteration: 2, // Set to max iterations so no loop iterations happen
        maxIterations: 2,
        timeout: 60000,
        tools: []
      }
      
      mockStateManager.getState.mockReturnValue(mockState)
      mockStateManager.findNextStep.mockReturnValue(workflow.steps[0]) // Always has a next step
      
      // The check should return true indicating max iterations reached
      mockStateManager.isMaxIterationsReached.mockReturnValue(true)

      const results: any[] = []
      const userPrompt = 'Test user prompt'
      for await (const result of workflowExecutor.execute(userPrompt, workflow)) {
        results.push(result)
      }

      // Should yield 1 error result for max iterations exceeded (no steps executed)
      expect(results).toHaveLength(1)
      
      // Should be the max iterations error
      expect(results[0]).toMatchObject({
        stepId: '1', // currentStep will be the found step
        error: {
          message: 'Workflow exceeded maximum iterations'
        }
      })
      
      // Should have executed 0 steps since max iterations was already reached
      expect(mockStepExecutor.execute).toHaveBeenCalledTimes(0)
    })
  })

  describe('Workflow Configuration', () => {
    it('should use default values for optional configuration', async () => {
      const workflow: AgentWorkflow = {
        id: 'default-config-workflow',
        name: 'Default Config Workflow',
        steps: [
          {
            id: '1',
            description: 'Only step',
            prompt: 'Only step',
            generationTask: 'chat'
          }
        ],
        tools: []
        // No maxIterations or timeout specified - will use defaults
      }

      // Setup state manager
      mockStateManager.getState.mockReturnValue({
        workflow,
        startTime: Date.now(),
        completedSteps: new Set(),
        iteration: 1,
        maxIterations: 10, // Default value
        timeout: 60000, // Default value
        tools: []
      })
      mockStateManager.findNextStep
        .mockReturnValueOnce(workflow.steps[0])
        .mockReturnValue(null)

      mockStepExecutor.execute.mockResolvedValueOnce({
        stepId: '1',
        content: 'Completed',
        metadata: { stepType: 'chat' }
      })

      const results: any[] = []
      const userPrompt = 'Test user prompt'
      for await (const result of workflowExecutor.execute(userPrompt, workflow)) {
        results.push(result)
      }

      // Successful execution yields completed step  
      expect(results).toHaveLength(1)
      expect(mockStepExecutor.execute).toHaveBeenCalledTimes(1)
      
      // Verify step was completed and yielded
      expect(results[0]).toMatchObject({
        stepId: '1',
        content: 'Completed',
        metadata: { stepType: 'chat' }
      })
      
      // Verify step executor was called correctly
      expect(mockStepExecutor.execute).toHaveBeenCalledWith(workflow.steps[0], [])
    })

    it('should handle empty workflow steps', async () => {
      const workflow: AgentWorkflow = {
        id: 'empty-workflow',
        name: 'Empty Workflow',
        steps: [],
        tools: []
      }

      // Setup state manager with empty steps
      mockStateManager.getState.mockReturnValue({
        workflow,
        startTime: Date.now(),
        completedSteps: new Set(),
        iteration: 1,
        maxIterations: 10,
        timeout: 60000,
        tools: []
      })
      mockStateManager.findNextStep.mockReturnValue(null) // No steps to find

      const results: any[] = []
      const userPrompt = 'Test user prompt'
      for await (const result of workflowExecutor.execute(userPrompt, workflow)) {
        results.push(result)
      }

      // Should complete immediately with no results
      expect(results).toHaveLength(0)
      expect(mockStepExecutor.execute).not.toHaveBeenCalled()
    })
  })
})
