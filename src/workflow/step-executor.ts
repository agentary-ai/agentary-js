import type { Session } from '../types/session'
import type { Tool, GenerateArgs, Message } from '../types/worker';
import type { 
  WorkflowStep,
} from '../types/agent-session';

import { logger } from '../utils/logger';
import { ToolParser } from '../processing/tools/parser';
import { ContentProcessor } from '../processing/content/processor';
import { WorkflowStateManager } from './workflow-state';
import { WorkflowIterationResponse } from '../types/agent-session';

export class StepExecutor {
  private session: Session;
  private toolParser: ToolParser;
  private contentProcessor: ContentProcessor;
  private workflowStateManager: WorkflowStateManager;

  constructor(
    session: Session, 
    workflowStateManager: WorkflowStateManager,
  ) {
    this.session = session;
    this.toolParser = new ToolParser();
    this.contentProcessor = new ContentProcessor();
    this.workflowStateManager = workflowStateManager;
  }

  async execute(
    step: WorkflowStep, tools: Tool[]
  ): Promise<WorkflowIterationResponse> {
    const stepStartTime = Date.now();
    const stepState = this.workflowStateManager.getStepState(step.id);
    
    logger.agent.debug('Executing step', { 
      stepId: step.id,
      hasToolChoice: !!step.toolChoice,
      attempt: stepState.attempts + 1,
      maxAttempts: stepState.maxAttempts
    });
    
    // Create checkpoint for potential rollback
    this.workflowStateManager.createCheckpoint(step.id);

    try {      
      // Increment attempt counter
      stepState.attempts = stepState.attempts + 1;

      // Prepare generation arguments and filtered tools
      const { generateArgs, filteredTools, isLastStep } = await this.prepareGeneration(step, tools);

      // Generate response
      const stepResult = await this.executeGeneration(step, generateArgs);

      // Filter out thinking tags and extract clean content
      const { cleanContent, thinkingContent } = this.contentProcessor.removeThinkTags(stepResult);
      
      if (step.generationTask === 'tool_use') {
        return await this.handleToolUse(
          step, 
          filteredTools, 
          cleanContent, 
          thinkingContent, 
          stepResult, 
          isLastStep, 
          stepState, 
          stepStartTime
        );
      } else {
        return this.handleContentResponse(step, cleanContent, stepResult, isLastStep, stepStartTime);
      }        
    } catch (error: any) {
      return this.handleError(error, step, stepState, stepStartTime);
    }
  }

  private async prepareGeneration(
    step: WorkflowStep, 
    tools: Tool[]
  ): Promise<{ generateArgs: GenerateArgs; filteredTools: Tool[]; isLastStep: boolean }> {
    let prompt = step.prompt;
    const isLastStep = this.workflowStateManager.isLastStep(step.id);

    // Use formatter to format step instruction
    const stepInstruction = this.workflowStateManager.getFormattedStepInstruction(step.id, prompt);
    
    await this.workflowStateManager.addMessagesToMemory([{
      role: 'user',
      content: stepInstruction,
    }], true);

    if (step.generationTask) {
    } else if (step.toolChoice && step.toolChoice.length > 0) {
      // Add tool use prompt suffix by default if tool choice is provided
      step.generationTask = 'tool_use';
    }

    // Select tools based on generationTask and toolChoice
    let filteredTools: Tool[];
    if (step.generationTask !== 'tool_use') {
      // Include no tools if generation task is not tool_use
      filteredTools = [];
    } else if (!step.toolChoice || step.toolChoice.length === 0) {
      // Include all tools if toolChoice is empty for tool_use tasks
      filteredTools = tools;
    } else {
      // Filter tools by toolChoice names for tool_use tasks
      filteredTools = tools.filter(tool => step.toolChoice!.includes(tool.function.name));
    }
    
    // Get messages from memory (now async)
    const memoryMessages = await this.workflowStateManager.getMessages();
    
    // System and user prompts are already in memory, so just use memoryMessages
    const generateArgs: GenerateArgs = {
      messages: memoryMessages,
      temperature: step.temperature ?? 0.1,
      max_new_tokens: step.maxTokens ?? 1024,
      enable_thinking: step.enableThinking ?? false,
    };
    if (filteredTools.length > 0) {
      generateArgs.tools = filteredTools;
    }

    return { generateArgs, filteredTools, isLastStep };
  }

  private async executeGeneration(
    step: WorkflowStep, 
    generateArgs: GenerateArgs
  ): Promise<string> {
    let stepResult = '';
    for await (const chunk of this.session.createResponse(
      generateArgs, step.generationTask
    )) {
      if (!chunk.isLast) {
        stepResult += chunk.token;
      }
    }
    logger.agent.debug('Step result', {
      stepId: step.id,
      resultLength: stepResult.length,
      generationTask: step.generationTask,
      currentTokenCount: this.workflowStateManager.getCurrentTokenCount(),
      messageCount: this.workflowStateManager.getMessageCount()
    });
    return stepResult;
  }

  private async handleToolUse(
    step: WorkflowStep,
    filteredTools: Tool[],
    cleanContent: string,
    thinkingContent: string | undefined,
    stepResult: string,
    isLastStep: boolean,
    stepState: any,
    stepStartTime: number
  ): Promise<WorkflowIterationResponse> {
    // Parse potential tool calls from the clean content
    const toolCall = this.toolParser.parse(cleanContent);
    logger.agent.debug('Tool call parsing result', { 
      stepId: step.id,
      toolName: toolCall?.name,
      hasArgs: !!toolCall?.args
    });
    
    if (!toolCall) {
      logger.agent.error('Tool call parsing failed', {
        stepId: step.id,
        cleanContent,
        rawContent: stepResult,
        expectedTools: step.toolChoice,
        thinkingContent: thinkingContent?.substring(0, 200) // Log first 200 chars of thinking
      });
      // Rollback to checkpoint before this step
      this.workflowStateManager.rollbackToCheckpoint(step.id);
      this.workflowStateManager.handleStepCompletion(step.id, false);
      const willRetry = stepState.maxAttempts && stepState.attempts < stepState.maxAttempts;

      return {
        stepId: step.id,
        error: {
          message: 'No tool call detected in response for tool_use generation task'
        },
        metadata: {
          duration: Date.now() - stepStartTime,
          rawResult: stepResult,
          cleanContent, // Add clean content to help debug
          stepType: step.generationTask,
          attempt: stepState.attempts,
          maxAttempts: stepState.maxAttempts,
          willRetry
        }
      };
    }
    
    // Find tool in tools array
    const toolSelected = filteredTools.find(tool => tool.function.name === toolCall.name);
    if (!toolSelected) {
      logger.agent.error('Tool not found', {
        stepId: step.id,
        requestedTool: toolCall.name,
        availableTools: filteredTools.map(t => t.function.name),
        parsedArgs: toolCall.args
      });
      // Rollback to checkpoint before this step
      this.workflowStateManager.rollbackToCheckpoint(step.id);
      this.workflowStateManager.handleStepCompletion(step.id, false);
      
      const willRetry = stepState.maxAttempts && stepState.attempts < stepState.maxAttempts;
      
      return {
        stepId: step.id,
        error: {
          message: 'Tool ' + toolCall.name + ' not found for tool_use generation task'
        },
        metadata: {
          duration: Date.now() - stepStartTime,
          rawResult: stepResult,
          stepType: step.generationTask,
          attempt: stepState.attempts,
          maxAttempts: stepState.maxAttempts,
          willRetry
        }
      };
    }

    if (toolSelected.function.implementation) {
      const toolResult = await toolSelected.function.implementation(toolCall.args);
      logger.agent.debug('Tool execution result', {
        stepId: step.id,
        toolName: toolCall.name,
        resultType: typeof toolResult
      });
      
      await this.workflowStateManager.addMessagesToMemory([
        {
          role: 'assistant',
          content: cleanContent,
        },
        {
          role: 'user',
          content: JSON.stringify(toolResult),
        }
      ], isLastStep);
      
      this.workflowStateManager.addToolResult(step.id, {
        name: toolCall.name,
        description: toolSelected.function.description,
        result: JSON.stringify(toolResult)
      });
      
      this.workflowStateManager.handleStepCompletion(step.id, true, JSON.stringify(toolResult));
      
      return {
        stepId: step.id,
        toolCall: {
          name: toolCall.name,
          args: toolCall.args,
          result: JSON.stringify(toolResult)
        },
        metadata: {
          duration: Date.now() - stepStartTime,
          rawResult: stepResult,
          stepType: step.generationTask,
        }
      };
    } else {
      await this.workflowStateManager.addMessagesToMemory([{
        role: 'assistant',
        content: cleanContent,
      }], isLastStep);
      
      return {
        stepId: step.id,
        toolCall: {
          name: toolCall.name,
          args: toolCall.args,
        },
        metadata: {
          duration: Date.now() - stepStartTime,
          rawResult: stepResult,
          stepType: step.generationTask,
        }
      };
    }
  }

  private handleContentResponse(
    step: WorkflowStep,
    cleanContent: string,
    stepResult: string,
    isLastStep: boolean,
    stepStartTime: number
  ): WorkflowIterationResponse {
    this.workflowStateManager.addMessagesToMemory([{
      role: 'assistant',
      content: cleanContent,
    }], isLastStep);
    
    this.workflowStateManager.handleStepCompletion(step.id, true, cleanContent);
    
    return {
      stepId: step.id,
      content: cleanContent,
      metadata: {
        duration: Date.now() - stepStartTime,
        rawResult: stepResult,
        stepType: step.generationTask,
      }
    };
  }

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
      currentTokenCount: this.workflowStateManager.getCurrentTokenCount(),
      memoryPressure: this.workflowStateManager.isContextNearLimit()
    });
    
    this.workflowStateManager.handleStepCompletion(step.id, false);
    
    return {
      stepId: step.id,
      error: {
        message: 'Step execution failed: ' + error.message
      },
      metadata: {
        duration: Date.now() - stepStartTime,
        stepType: step.generationTask,
        attempt: stepState.attempts,
        maxAttempts: stepState.maxAttempts,
        willRetry
      }
    };
  }
}

