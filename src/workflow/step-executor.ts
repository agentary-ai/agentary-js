import type { Session } from '../types/session'
import type { Tool, GenerateArgs, Message } from '../types/worker';
import type { 
  WorkflowStep,
} from '../types/agent-session';
import type { AgentMemory } from '../types/workflow-state';

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
    
    // Track initial message count for potential rollback
    const initialMessageCount = this.workflowStateManager.getMessageCount();

    try {
      if (stepState.attempts && stepState.maxAttempts && stepState.attempts >= stepState.maxAttempts) {
        stepState.complete = false;
        this.workflowStateManager.handleStepCompletion(step.id, false);
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
      this.workflowStateManager.addMessageToMemory({
        role: 'user',
        content: prompt,
      });
      
      // Interpolate placeholders with actual values from previous steps
      // const interpolatedPrompt = this.interpolatePrompt(prompt, this.workflowStateManager.getState().memory);
      
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

      // const messages: Message[] = [
      //   {
      //     role: 'system',
      //     content: this.workflowStateManager.getSystemMessage()
      //   },
      //   {
      //     role: 'user',
      //     content: `Step ${step.id}: ${interpolatedPrompt}`
      //   }
      // ];
      
      
      // Context and tool results are now included in the updated system message
      const generateArgs: GenerateArgs = {
        messages: this.workflowStateManager.getState().memory.messages!,
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
        currentTokenCount: this.workflowStateManager.getCurrentTokenCount(),
        messageCount: this.workflowStateManager.getMessageCount()
      });

      // Filter out thinking tags and extract clean content
      const { cleanContent, thinkingContent } = this.contentProcessor.removeThinkTags(stepResult);

      this.workflowStateManager.addMessageToMemory({
        role: 'assistant',
        content: cleanContent,
      });
      
      if (step.generationTask === 'tool_use') {
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
          // Rollback any messages that were added during this step execution
          this.workflowStateManager.rollbackMessagesToCount(initialMessageCount);
          this.workflowStateManager.handleStepCompletion(step.id, false);
          return {
            id: step.id,
            error: {
              message: 'No tool call detected in response for tool_use generation task'
            },
            metadata: {
              duration: Date.now() - stepStartTime,
              rawResult: stepResult,
              cleanContent, // Add clean content to help debug
              stepType: step.generationTask,
            }
          };
        }
        
        // Find tool in tools array
        const toolSelected = tools.find(tool => tool.function.name === toolCall.name);
        if (!toolSelected) {
          logger.agent.error('Tool not found', {
            stepId: step.id,
            requestedTool: toolCall.name,
            availableTools: tools.map(t => t.function.name),
            parsedArgs: toolCall.args
          });
          // Rollback any messages that were added during this step execution
          this.workflowStateManager.rollbackMessagesToCount(initialMessageCount);
          this.workflowStateManager.handleStepCompletion(step.id, false);
          return {
            id: step.id,
            error: {
              message: 'Tool ' + toolCall.name + ' not found for tool_use generation task'
            },
            metadata: {
              duration: Date.now() - stepStartTime,
              rawResult: stepResult,
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
            this.workflowStateManager.addMessageToMemory({
              role: 'user',
              content: JSON.stringify(toolResult),
            });
            this.workflowStateManager.handleStepCompletion(step.id, true, JSON.stringify(toolResult));
            return {
              id: step.id,
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
            return {
              id: step.id,
              toolCall: {
                name: toolCall.name,
                args: toolCall.args,
              },
              metadata: {
                duration: Date.now() - stepStartTime,
                rawResult: stepResult,
                stepType: step.generationTask,
              }
            }
          }
      } else {
        this.workflowStateManager.handleStepCompletion(step.id, true, cleanContent);
        return {
          id: step.id,
          content: cleanContent,
          metadata: {
            duration: Date.now() - stepStartTime,
            rawResult: stepResult,
            stepType: step.generationTask,
          }
        };
      }        
    } catch (error: any) {
      // Rollback any messages that were added during this step execution
      this.workflowStateManager.rollbackMessagesToCount(initialMessageCount);
      logger.agent.error('Step execution failed, rolling back messages', {
        stepId: step.id,
        error: error.message,
        initialMessageCount,
        rolledBackTo: initialMessageCount,
        currentTokenCount: this.workflowStateManager.getCurrentTokenCount(),
        memoryPressure: this.workflowStateManager.isContextNearLimit()
      });
      
      this.workflowStateManager.handleStepCompletion(step.id, false);
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

  // private interpolatePrompt(prompt: string, memory: AgentMemory): string {
  //   // Replace placeholders like { city } with actual values from previous steps
  //   let interpolated = prompt;
    
  //   // Find all placeholders in the format { key }
  //   const placeholderRegex = /\{\s*(\w+)\s*\}/g;
  //   const matches = [...prompt.matchAll(placeholderRegex)];
    
  //   for (const match of matches) {
  //     const key = match[1];
  //     if (!key) continue;
      
  //     // Search for the value in previous step results
  //     for (const stepState of Object.values(memory.steps)) {
  //       if (stepState.result) {
  //         try {
  //           const parsed = JSON.parse(stepState.result);
  //           if (parsed[key] !== undefined) {
  //             interpolated = interpolated.replace(match[0], JSON.stringify(parsed[key]));
  //             break;
  //           }
  //         } catch {
  //           // If not JSON, search for key: value pattern
  //           const valueMatch = stepState.result.match(new RegExp(`${key}:\\s*([^,\\n]+)`));
  //           if (valueMatch && valueMatch[1]) {
  //             interpolated = interpolated.replace(match[0], valueMatch[1].trim());
  //             break;
  //           }
  //         }
  //       }
  //     }
  //   }
    
  //   logger.agent.debug('Prompt interpolation', {
  //     original: prompt,
  //     interpolated,
  //     foundPlaceholders: matches.map(m => m[1])
  //   });
    
  //   return interpolated;
  // }
}

