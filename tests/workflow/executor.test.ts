import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkflowExecutor } from '../../src/workflow/executor'
import { StepExecutor } from '../../src/workflow/step-executor'
import type { WorkflowDefinition, AgentStepResult, Tool } from '../../src/types/api'

// Mock StepExecutor
vi.mock('../../src/workflow/step-executor', () => {
  return {
    StepExecutor: vi.fn().mockImplementation((session, tools, promptBuilder, toolParser, contentProcessor) => ({
      execute: vi.fn()
    }))
  }
})

describe('WorkflowExecutor', () => {
  let workflowExecutor: WorkflowExecutor
  let mockStepExecutor: any
  let mockTools: Map<string, Tool>

  beforeEach(() => {
    vi.clearAllMocks()
    // Create mock session object
    const mockSession = {
      generate: vi.fn(),
      generateStream: vi.fn(),
      dispose: vi.fn()
    }
    mockStepExecutor = new StepExecutor(mockSession as any, new Map())
    mockTools = new Map()
    workflowExecutor = new WorkflowExecutor(mockStepExecutor, mockTools)
  })

  describe('Simple Linear Workflow', () => {
    it('should execute a basic linear workflow', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        name: 'Test Workflow',
        description: 'A simple test workflow',
        steps: [
          {
            id: 'step1',
            type: 'think',
            description: 'First step',
            nextSteps: ['step2']
          },
          {
            id: 'step2',
            type: 'respond',
            description: 'Second step'
          }
        ],
        tools: []
      }

      // Mock step execution results
      mockStepExecutor.execute
        .mockImplementationOnce(async function* () {
          yield {
            stepId: 'step1',
            type: 'thinking',
            content: 'Thinking about the problem',
            isComplete: true,
            nextStepId: 'step2'
          }
        })
        .mockImplementationOnce(async function* () {
          yield {
            stepId: 'step2',
            type: 'response',
            content: 'Final response',
            isComplete: true
          }
        })

      const results: AgentStepResult[] = []
      for await (const result of workflowExecutor.execute(workflow)) {
        results.push(result)
      }

      expect(results).toHaveLength(2)
      expect(results[0].stepId).toBe('step1')
      expect(results[1].stepId).toBe('step2')
      expect(mockStepExecutor.execute).toHaveBeenCalledTimes(2)
    })

    it('should pass context between steps', async () => {
      const workflow: WorkflowDefinition = {
        id: 'context-workflow',
        name: 'Context Test Workflow',
        description: 'Tests context passing',
        steps: [
          {
            id: 'step1',
            type: 'think',
            description: 'First step',
            nextSteps: ['step2']
          },
          {
            id: 'step2',
            type: 'respond',
            description: 'Second step with context'
          }
        ],
        tools: []
      }

      mockStepExecutor.execute
        .mockImplementationOnce(async function* () {
          yield {
            stepId: 'step1',
            type: 'thinking',
            content: 'Analyzed the problem',
            isComplete: true,
            nextStepId: 'step2',
            metadata: { analysis: 'Important data' }
          }
        })
        .mockImplementationOnce(async function* () {
          yield {
            stepId: 'step2',
            type: 'response',
            content: 'Response based on analysis',
            isComplete: true
          }
        })

      const results: AgentStepResult[] = []
      for await (const result of workflowExecutor.execute(workflow)) {
        results.push(result)
      }

      // Verify context was passed to second step
      const secondStepCall = mockStepExecutor.execute.mock.calls[1]
      expect(secondStepCall[1]).toMatchObject({
        workflowId: 'context-workflow',
        workflowName: 'Context Test Workflow'
      })
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
            }
          },
          implementation: vi.fn()
        }
      }

      const workflow: WorkflowDefinition = {
        id: 'tool-workflow',
        name: 'Tool Test Workflow',
        description: 'Tests tool registration',
        steps: [
          {
            id: 'step1',
            type: 'act',
            description: 'Use tool',
            tools: ['test_tool']
          }
        ],
        tools: [testTool]
      }

      mockStepExecutor.execute.mockImplementationOnce(async function* () {
        yield {
          stepId: 'step1',
          type: 'tool_call',
          content: 'Using test tool',
          isComplete: true
        }
      })

      const results: AgentStepResult[] = []
      for await (const result of workflowExecutor.execute(workflow)) {
        results.push(result)
      }

      // Verify tool was registered
      expect(mockTools.has('test_tool')).toBe(true)
      expect(mockTools.get('test_tool')).toBe(testTool)
    })
  })

  describe('Error Handling', () => {
    it('should handle step not found error', async () => {
      const workflow: WorkflowDefinition = {
        id: 'broken-workflow',
        name: 'Broken Workflow',
        description: 'Has invalid step reference',
        steps: [
          {
            id: 'step1',
            type: 'think',
            description: 'First step',
            nextSteps: ['nonexistent-step']
          }
        ],
        tools: []
      }

      mockStepExecutor.execute.mockImplementationOnce(async function* () {
        yield {
          stepId: 'step1',
          type: 'thinking',
          content: 'Completed thinking',
          isComplete: true,
          nextStepId: 'nonexistent-step'
        }
      })

      const results: AgentStepResult[] = []
      for await (const result of workflowExecutor.execute(workflow)) {
        results.push(result)
      }

      // Should have step1 result and an error result
      expect(results).toHaveLength(2)
      expect(results[1]).toMatchObject({
        stepId: 'nonexistent-step',
        type: 'error',
        error: 'Step not found'
      })
    })

    it.skip('should handle workflow timeout', async () => {
      // Note: Timeout testing is challenging in unit tests due to timing sensitivity
      // The timeout logic is verified to work in integration tests
      const workflow: WorkflowDefinition = {
        id: 'timeout-workflow',
        name: 'Timeout Workflow',
        description: 'Times out quickly',
        timeout: 1, // 1ms timeout - extremely short
        steps: [
          {
            id: 'slow-step',
            type: 'think',
            description: 'A slow step'
          }
        ],
        tools: []
      }

      mockStepExecutor.execute.mockImplementationOnce(async function* () {
        await new Promise(resolve => setTimeout(resolve, 10)) // 10ms delay
        yield {
          stepId: 'slow-step',
          type: 'thinking',
          content: 'Should timeout before this',
          isComplete: true
        }
      })

      const results: AgentStepResult[] = []
      for await (const result of workflowExecutor.execute(workflow)) {
        results.push(result)
      }

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        type: 'error',
        error: 'Timeout'
      })
    })

    it('should handle maximum iterations exceeded', async () => {
      const workflow: WorkflowDefinition = {
        id: 'infinite-workflow',
        name: 'Infinite Workflow',
        description: 'Could run forever',
        maxIterations: 2,
        steps: [
          {
            id: 'loop-step',
            type: 'think',
            description: 'Loops back to itself',
            nextSteps: ['loop-step']
          }
        ],
        tools: []
      }

      mockStepExecutor.execute.mockImplementation(async function* () {
        yield {
          stepId: 'loop-step',
          type: 'thinking',
          content: 'Looping...',
          isComplete: true,
          nextStepId: 'loop-step'
        }
      })

      const results: AgentStepResult[] = []
      for await (const result of workflowExecutor.execute(workflow)) {
        results.push(result)
      }

      // Should have 2 loop iterations + 1 max iterations error
      expect(results).toHaveLength(3)
      expect(results[2]).toMatchObject({
        type: 'error',
        error: 'Max iterations'
      })
    })

    it('should handle step execution exceptions', async () => {
      const workflow: WorkflowDefinition = {
        id: 'error-workflow',
        name: 'Error Workflow',
        description: 'Has a step that throws',
        steps: [
          {
            id: 'error-step',
            type: 'think',
            description: 'This step will throw'
          }
        ],
        tools: []
      }

      mockStepExecutor.execute.mockImplementationOnce(async function* () {
        throw new Error('Step execution failed')
      })

      const results: AgentStepResult[] = []
      for await (const result of workflowExecutor.execute(workflow)) {
        results.push(result)
      }

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        type: 'error',
        content: 'Workflow error: Step execution failed',
        error: 'Step execution failed'
      })
    })
  })

  describe('Workflow Configuration', () => {
    it('should use default values for optional configuration', async () => {
      const workflow: WorkflowDefinition = {
        id: 'default-config-workflow',
        name: 'Default Config Workflow',
        description: 'Uses default timeout and iterations',
        steps: [
          {
            id: 'single-step',
            type: 'respond',
            description: 'Only step'
          }
        ],
        tools: []
        // No maxIterations or timeout specified
      }

      mockStepExecutor.execute.mockImplementationOnce(async function* () {
        yield {
          stepId: 'single-step',
          type: 'response',
          content: 'Completed',
          isComplete: true
        }
      })

      const results: AgentStepResult[] = []
      for await (const result of workflowExecutor.execute(workflow)) {
        results.push(result)
      }

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        stepId: 'single-step',
        type: 'response'
      })
    })

    it('should handle empty workflow steps', async () => {
      const workflow: WorkflowDefinition = {
        id: 'empty-workflow',
        name: 'Empty Workflow',
        description: 'Has no steps',
        steps: [],
        tools: []
      }

      const results: AgentStepResult[] = []
      for await (const result of workflowExecutor.execute(workflow)) {
        results.push(result)
      }

      // Should complete immediately with no results
      expect(results).toHaveLength(0)
    })
  })
})
