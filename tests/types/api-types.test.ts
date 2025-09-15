import { describe, it, expect } from 'vitest'
import type { 
  CreateSessionArgs, 
  GenerateArgs, 
  TokenStreamChunk,
  WorkflowDefinition,
  Tool
} from '../../src/types/api'

describe('API Types', () => {
  describe('CreateSessionArgs', () => {
    it('should accept valid model configuration', () => {
      const config: CreateSessionArgs = {
        models: {
          chat: {
            name: 'test-model',
            quantization: 'q4'
          }
        },
        engine: 'webgpu'
      }
      
      expect(config.models?.chat?.name).toBe('test-model')
      expect(config.engine).toBe('webgpu')
    })

    it('should accept multiple model types', () => {
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
          },
          reasoning: {
            name: 'reasoning-model',
            quantization: 'q4'
          }
        }
      }
      
      expect(Object.keys(config.models!)).toHaveLength(4)
    })

    it('should be valid with minimal configuration', () => {
      const config: CreateSessionArgs = {}
      expect(config).toBeDefined()
    })
  })

  describe('GenerateArgs', () => {
    it('should accept basic generation parameters', () => {
      const args: GenerateArgs = {
        prompt: 'Hello, world!',
        system: 'You are a helpful assistant',
        temperature: 0.7,
        top_p: 0.9,
        top_k: 50
      }
      
      expect(args.prompt).toBe('Hello, world!')
      expect(args.temperature).toBe(0.7)
    })

    it('should accept tools', () => {
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

      const args: GenerateArgs = {
        prompt: 'Use the tool',
        tools
      }
      
      expect(args.tools).toHaveLength(1)
      expect(args.tools![0].function.name).toBe('test_tool')
    })
  })

  describe('TokenStreamChunk', () => {
    it('should represent streaming token data', () => {
      const chunk: TokenStreamChunk = {
        token: 'Hello',
        tokenId: 1,
        isFirst: true,
        isLast: false,
        ttfbMs: 150
      }
      
      expect(chunk.token).toBe('Hello')
      expect(chunk.isFirst).toBe(true)
      expect(chunk.ttfbMs).toBe(150)
    })

    it('should handle final chunk', () => {
      const finalChunk: TokenStreamChunk = {
        token: '',
        tokenId: -1,
        isFirst: false,
        isLast: true
      }
      
      expect(finalChunk.isLast).toBe(true)
      expect(finalChunk.ttfbMs).toBeUndefined()
    })
  })

  describe('WorkflowDefinition', () => {
    it('should define a valid workflow', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        name: 'Test Workflow',
        description: 'A test workflow',
        steps: [
          {
            id: 'step1',
            type: 'think',
            description: 'Think about the problem',
            nextSteps: ['step2']
          },
          {
            id: 'step2',
            type: 'respond',
            description: 'Provide response'
          }
        ],
        tools: [],
        maxIterations: 5,
        timeout: 30000
      }
      
      expect(workflow.steps).toHaveLength(2)
      expect(workflow.steps[0].type).toBe('think')
      expect(workflow.maxIterations).toBe(5)
    })
  })

  describe('Tool', () => {
    it('should define a valid tool', () => {
      const tool: Tool = {
        type: 'function',
        function: {
          name: 'calculate',
          description: 'Perform mathematical calculations',
          parameters: {
            type: 'object',
            properties: {
              expression: {
                type: 'string',
                description: 'Mathematical expression'
              }
            },
            required: ['expression']
          },
          implementation: (expression: string) => {
            return `Result: ${expression}`
          }
        }
      }
      
      expect(tool.type).toBe('function')
      expect(tool.function.name).toBe('calculate')
      expect(tool.function.implementation).toBeTypeOf('function')
      
      if (tool.function.implementation) {
        const result = tool.function.implementation('2 + 2')
        expect(result).toBe('Result: 2 + 2')
      }
    })
  })
})
