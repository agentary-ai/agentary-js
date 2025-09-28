import type { Session } from '../types/session'
import type { Tool, GenerateArgs, Message } from '../types/worker';
import type { 
  WorkflowStep,
} from '../types/agent-session';

import { logger } from '../utils/logger';
import { ToolParser } from '../processing/tools/parser';
import { ContentProcessor } from '../processing/content/processor';
import { WorkflowStateManager } from './workflow-state';
import { WorkflowStepResponse } from '../types/agent-session';

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
  ): Promise<WorkflowStepResponse> {
    const stepStartTime = Date.now();
    logger.agent.debug('Executing step', { 
      stepId: step.id,
      hasToolChoice: !!step.toolChoice
    });
    const stepState = this.workflowStateManager.getStepState(step.id);

    try {
      if (stepState.attempts && stepState.maxAttempts && stepState.attempts >= stepState.maxAttempts) {
        stepState.complete = false;
        return {
          id: step.id,
          error: {
            message: 'Max retries exceeded'
          },
          metadata: {
            duration: Date.now() - stepStartTime,
            stepType: step.generationTask,
          }
        };
      }

      // Reset step state
      stepState.attempts = stepState.attempts + 1

      let prompt = step.prompt;
      if (step.generationTask) {
      } else if (step.toolChoice && step.toolChoice.length > 0) {
        // Add tool use prompt suffix by default if tool choice is provided
        step.generationTask = 'tool_use';
      }

      // Select tools based on generationTask and toolChoice
      if (step.generationTask !== 'tool_use') {
        // Include no tools if generation task is not tool_use
        tools = [];
      } else if (!step.toolChoice || step.toolChoice.length === 0) {
        // Include all tools if toolChoice is empty for tool_use tasks
        // tools array remains unchanged (contains all tools)
      } else {
        // Filter tools by toolChoice names for tool_use tasks
        tools = tools.filter(tool => step.toolChoice!.includes(tool.function.name));
      }

      const messages: Message[] = [
        {
          role: 'system',
          content: this.workflowStateManager.getSystemMessage()
        },
        {
          role: 'user',
          content: `Step ${step.id}: ${prompt}`
        }
      ];
      
      // Context and tool results are now included in the updated system message
      const generateArgs: GenerateArgs = {
        messages,
        temperature: step.temperature ?? 0.1,
        max_new_tokens: step.maxTokens ?? 1024,
      };
      if (tools.length > 0) {
        generateArgs.tools = tools;
      }

      // Generate response
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
      });

      // Filter out thinking tags and extract clean content
      const { cleanContent, thinkingContent } = this.contentProcessor.removeThinkTags(stepResult);
      
      if (step.generationTask === 'tool_use') {
        // Parse potential tool calls from the clean content
        const toolCall = this.toolParser.parse(cleanContent);
        logger.agent.debug('Tool call parsing result', { 
          stepId: step.id,
          toolName: toolCall?.name,
          hasArgs: !!toolCall?.args
        });
        if (!toolCall) {
          return {
            id: step.id,
            error: {
              message: 'No tool call detected in response for tool_use generation task'
            },
            metadata: {
              duration: Date.now() - stepStartTime,
              stepType: step.generationTask,
            }
          };
        }
        
        // Find tool in tools array
        const toolSelected = tools.find(tool => tool.function.name === toolCall.name);
        if (!toolSelected) {
          return {
            id: step.id,
            error: {
              message: 'Tool ' + toolCall.name + ' not found for tool_use generation task'
            },
            metadata: {
              duration: Date.now() - stepStartTime,
              stepType: step.generationTask,
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
            this.workflowStateManager.updateStepResult(step.id, JSON.stringify(toolResult));
            this.workflowStateManager.updateStepCompletion(step.id, true);
            return {
              id: step.id,
              toolCall: {
                name: toolCall.name,
                args: toolCall.args,
                result: JSON.stringify(toolResult)
              },
              metadata: {
                duration: Date.now() - stepStartTime,
                stepType: step.generationTask,
              }
            };
          } else {
            return {
              id: step.id,
              toolCall: {
                name: toolCall.name,
                args: toolCall.args,
              },
              metadata: {
                duration: Date.now() - stepStartTime,
                stepType: step.generationTask,
              }
            }
          }
      } else {
        this.workflowStateManager.updateStepCompletion(step.id, true);
        this.workflowStateManager.updateStepResult(step.id, cleanContent);
        return {
          id: step.id,
          content: cleanContent,
          metadata: {
            duration: Date.now() - stepStartTime,
            stepType: step.generationTask,
          }
        };
      }        
    } catch (error: any) {
      return {
        id: step.id,
        error: {
          message: 'Step execution failed: ' + error.message
        },
        metadata: {
          duration: Date.now() - stepStartTime,
          stepType: step.generationTask,
        }
      };
    }
  }
}

