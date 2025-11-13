import type { ModelResponse, NonStreamingResponse, Session } from '../types/session'
import type { Tool, GenerateArgs } from '../types/worker';
import type { 
  WorkflowStep,
} from '../types/agent-session';

import { logger } from '../utils/logger';
import { WorkflowStateManager } from './workflow-state';
import { WorkflowIterationResponse } from '../types/agent-session';

/**
 * Executes individual workflow steps, handling tool calls and response generation.
 */
export class StepExecutor {
  private session: Session;
  private workflowStateManager: WorkflowStateManager;

  constructor(
    session: Session,
    workflowStateManager: WorkflowStateManager,
  ) {
    this.session = session;
    this.workflowStateManager = workflowStateManager;
  }

  /**
   * Executes a workflow step, handling tool calls and response generation.
   * 
   * @param step - The workflow step to execute
   * @param tools - The tools to use for the step
   * @returns A promise that resolves with the workflow iteration response
   */
  async execute(
    step: WorkflowStep, tools: Tool[]
  ): Promise<WorkflowIterationResponse> {
    const stepStartTime = Date.now();
    const stepState = this.workflowStateManager.getStepState(step.id);
    
    logger.agent.info('Executing step', { 
      ...step,
      attempt: stepState.attempts + 1,
      maxAttempts: stepState.maxAttempts
    });
    
    // Create checkpoint for potential rollback
    this.workflowStateManager.createCheckpoint(step.id);

    try {      
      // Increment attempt counter
      stepState.attempts = stepState.attempts + 1;

      // Prepare generation arguments and filtered tools
      const { generateArgs, toolsAvailable, isLastStep } = await this.prepareGeneration(step, tools);

      // Generate response
      const modelResponse = await this.session.createResponse(step.model, generateArgs) as NonStreamingResponse;
      
      logger.agent.debug('Model response received', {
        stepId: step.id,
        modelResponse,
        currentTokenCount: this.workflowStateManager.getCurrentTokenCount(),
        messageCount: this.workflowStateManager.getMessageCount(),
      });
      
      if (step.toolChoice && step.toolChoice.length > 0 && modelResponse.toolCalls) {
        return await this.handleToolUse(
          step, 
          toolsAvailable, 
          modelResponse, 
          isLastStep, 
          stepStartTime,
        );
      } else {
        return this.handleContentResponse(step, modelResponse, isLastStep, stepStartTime);
      }        
    } catch (error: any) {
      return this.handleError(error, step, stepState, stepStartTime);
    }
  }

  /**
   * Prepares the generation arguments and filtered tools for a workflow step.
   * 
   * @param step - The workflow step to prepare the generation arguments and filtered tools for
   * @param tools - The tools to use for the step
   * @returns A promise that resolves with the generation arguments and filtered tools
   */
  private async prepareGeneration(
    step: WorkflowStep, 
    tools: Tool[]
  ): Promise<{ generateArgs: GenerateArgs; toolsAvailable: Tool[]; isLastStep: boolean }> {
    let prompt = step.prompt;
    const isLastStep = this.workflowStateManager.isLastStep(step.id);

    // Use formatter to format step instruction
    const stepInstruction = this.workflowStateManager.getFormattedStepInstruction(step.id, prompt);

    await this.workflowStateManager.addMessagesToMemory([{
      role: 'user',
      content: stepInstruction,
      metadata: {
        type: 'step_prompt'
      }
    }], true);

    // Select tools based on generationTask and toolChoice
    let toolsAvailable: Tool[];
    if (!step.toolChoice || step.toolChoice.length === 0) {
      toolsAvailable = [];
    } else {
      // Filter tools by toolChoice names for tool_use tasks
      toolsAvailable = tools.filter(tool => step.toolChoice!.includes(tool.definition.name));
      logger.agent.debug('Tools available for step', {
        stepId: step.id,
        toolChoice: step.toolChoice,
        toolsAvailable: toolsAvailable.map(tool => tool.definition.name)
      });
    }
    
    // Get messages from memory (now async)
    const memoryMessages = await this.workflowStateManager.getMessages();
    
    // System and user prompts are already in memory, so just use memoryMessages
    const generateArgs: GenerateArgs = {
      messages: memoryMessages,
      enable_thinking: step.enableThinking ?? false,
      temperature: step.temperature ?? 0.1,
      max_new_tokens: step.maxTokens ?? 1024,
      stream: false,
    };
    if (toolsAvailable.length > 0) {
      // Extract just the tool definitions for the generate args
      generateArgs.tools = toolsAvailable.map(tool => tool.definition);
    }

    return { generateArgs, toolsAvailable, isLastStep };
  }

  /**
   * Handles the tool use for a workflow step.
   * 
   * @param step - The workflow step to handle the tool use for
   * @param toolsAvailable - The available tools to use for the step
   * @param modelResponse - The model response containing content and tool calls
   * @param isLastStep - Whether the step is the last step
   * @param stepState - The state of the step
   * @param stepStartTime - The start time of the step
   * @returns A promise that resolves with the workflow iteration response
   */
  private async handleToolUse(
    step: WorkflowStep,
    toolsAvailable: Tool[],
    modelResponse: ModelResponse,
    isLastStep: boolean,
    stepStartTime: number
  ): Promise<WorkflowIterationResponse> {
    // Type guard to ensure we have a non-streaming response
    if (modelResponse.type === 'streaming') {
      throw new Error('Streaming responses are not supported for tool use');
    }
    if (!modelResponse.toolCalls) {
      throw new Error('Tool calls not found in response');
    }

    for (const toolCall of modelResponse.toolCalls) {
      const toolSelected = toolsAvailable.find(
        tool => tool.definition.name === toolCall.function.name
      )!;

      if (!toolSelected.implementation) {
        throw new Error(
          'Tool implementation not found for tool ' + 
          toolCall.function.name
        );
      }

      const toolStartTime = Date.now();
      const emitter = this.session._eventEmitter;
      if (emitter) {
        emitter.emit({
          type: 'tool:call:start',
          stepId: step.id,
          toolName: toolCall.function.name,
          args: JSON.parse(toolCall.function.arguments),
          timestamp: toolStartTime
        });
      }

      // Execute tool
      let toolResult: any;
      try {
        toolResult = await toolSelected.implementation(
          JSON.parse(toolCall.function.arguments)
        );
        logger.agent.debug('Tool execution result', {
          stepId: step.id,
          toolName: toolCall.function.name,
          result: toolResult
        });
        if (emitter) {
          emitter.emit({
            type: 'tool:call:complete',
            stepId: step.id,
            toolName: toolCall.function.name,
            result: toolResult,
            duration: Date.now() - toolStartTime,
            timestamp: Date.now()
          });
        }
      } catch (error: any) {
        logger.agent.error('Tool execution failed', {
          stepId: step.id,
          toolName: toolCall.function.name,
          error: error.message
        });
        if (emitter) {
          emitter.emit({
            type: 'tool:call:error',
            stepId: step.id,
            toolName: toolCall.function.name,
            error: error.message,
            duration: Date.now() - toolStartTime,
            timestamp: Date.now()
          });
        }
        throw new Error('Tool execution failed: ' + error.message);
      }

      // Add tool result to memory
      await this.workflowStateManager.addMessagesToMemory([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.function.name,
              arguments: JSON.parse(toolCall.function.arguments)
            }
          ],
          metadata: {
            type: 'tool_use'
          }
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolCall.id,
              result: JSON.stringify(toolResult)
            }
          ],
          metadata: {
            type: 'tool_result'
          }
        }
      ], isLastStep);

      this.workflowStateManager.handleStepCompletion(step.id, true, JSON.stringify(toolResult));

      return {
        stepId: step.id,
        toolCall: {
          name: toolCall.function.name,
          args: JSON.parse(toolCall.function.arguments),
          result: JSON.stringify(toolResult)
        },
        metadata: {
          duration: Date.now() - stepStartTime,
          rawResult: modelResponse.content,
        }
      };
    }

    // This should never be reached due to the toolCalls check above
    throw new Error('No tool calls processed');
  }

  /**
   * Handles the content response for a workflow step.
   * 
   * @param step - The workflow step to handle the content response for
   * @param modelResponse - The model response containing content
   * @param isLastStep - Whether the step is the last step
   * @param stepStartTime - The start time of the step
   * @returns A promise that resolves with the workflow iteration response
   */
  private handleContentResponse(
    step: WorkflowStep,
    modelResponse: ModelResponse,
    isLastStep: boolean,
    stepStartTime: number
  ): WorkflowIterationResponse {
    // Type guard to ensure we have a non-streaming response
    if (modelResponse.type === 'streaming') {
      throw new Error('Streaming responses are not supported for content response');
    }

    const cleanContent = modelResponse.content;
    
    this.workflowStateManager.addMessagesToMemory([{
      role: 'assistant',
      content: cleanContent,
      metadata: {
        type: 'step_result'
      }
    }], isLastStep);
    
    // Handle step completion
    this.workflowStateManager.handleStepCompletion(step.id, true, cleanContent);
    
    return {
      stepId: step.id,
      content: cleanContent,
      metadata: {
        duration: Date.now() - stepStartTime,
        rawResult: modelResponse.content,
      }
    };
  }

  /**
   * Handles the error for a workflow step.
   * 
   * @param error - The error to handle
   * @param step - The workflow step to handle the error for
   * @param stepState - The state of the step
   * @param stepStartTime - The start time of the step
   * @returns A promise that resolves with the workflow iteration response
   */
  private handleError(
    error: any,
    step: WorkflowStep,
    stepState: any,
    stepStartTime: number
  ): WorkflowIterationResponse {
    // Rollback to checkpoint before this step
    this.workflowStateManager.rollbackToCheckpoint(step.id);
    
    const willRetry = stepState.maxAttempts && stepState.attempts < stepState.maxAttempts;
    
    logger.agent.error('Step execution failed, rolling back to checkpoint', {
      stepId: step.id,
      error: error.message,
      attempt: stepState.attempts,
      maxAttempts: stepState.maxAttempts,
      willRetry,
      checkpointId: step.id,
    });
    
    this.workflowStateManager.handleStepCompletion(step.id, false);
    
    return {
      stepId: step.id,
      error: {
        message: 'Step execution failed: ' + error.message
      },
      metadata: {
        duration: Date.now() - stepStartTime,
        attempt: stepState.attempts,
        maxAttempts: stepState.maxAttempts,
        willRetry
      }
    };
  }
}

