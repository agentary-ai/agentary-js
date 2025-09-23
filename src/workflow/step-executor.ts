import type { Session } from '../types/session'
import type { Tool, GenerateArgs } from '../types/worker';
import type { 
  WorkflowStep,
  AgentMemory,
} from '../types/agent-session';

import { logger } from '../utils/logger';
import { ToolParser } from '../processing/tools/parser';
import { ContentProcessor } from '../processing/content/processor';
import { getPromptSuffix } from '../processing/prompts/templates';

export class StepExecutor {
  private session: Session;
  private toolParser: ToolParser;
  private contentProcessor: ContentProcessor;

  constructor(
    session: Session, 
  ) {
    this.session = session;
    this.toolParser = new ToolParser();
    this.contentProcessor = new ContentProcessor();
  }

  async execute(
    step: WorkflowStep, agentMemory: AgentMemory, tools: Tool[]
  ): Promise<void> {
    const stepStartTime = Date.now();
    logger.agent.debug('Executing step', { step, agentMemory, tools });

    try {
      if (step.attempts && step.maxAttempts && step.attempts >= step.maxAttempts) {
        step.complete = false;
        step.response = {
          error: 'Max retries exceeded',
          content: '',
          toolCall: {},
        };
      }

      // Reset step state
      step.attempts = step.attempts ? step.attempts + 1 : 1;
      step.complete = false;
      step.response = {
        error: '',
        content: '',
        toolCall: {},
        metadata: {}
      };

      // Prepare prompt and add to agent memory
      let prompt = step.prompt;
      if (step.generationTask) {
        prompt = `${step.prompt} ${getPromptSuffix(step.generationTask)}`;
      } else if (step.toolChoice && step.toolChoice.length > 0) {
        // Add tool use prompt suffix by default if tool choice is provided
        step.generationTask = 'tool_use';
        prompt = `${step.prompt} ${getPromptSuffix('tool_use')}`;
      }

      agentMemory.messages.push({
        role: 'user',
        content: prompt
      });

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
      
      const generateArgs: GenerateArgs = {
        messages: agentMemory.messages,
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
        stepResult,
        generationTask: step.generationTask,
      });

      // Filter out thinking tags and extract clean content
      const { cleanContent, thinkingContent } = this.contentProcessor.removeThinkTags(stepResult);
      
      if (step.generationTask === 'tool_use') {
        // Parse potential tool calls from the clean content
        const toolCall = this.toolParser.parse(cleanContent);
        logger.agent.debug('Tool call parsing result', { 
          cleanContent, 
          toolCall, 
        });
        if (!toolCall) {
          step.complete = false;
          step.response = {
            error: 'No tool call detected in response',
            content: cleanContent,
            toolCall: {},
            metadata: {
              duration: Date.now() - stepStartTime,
              stepType: step.generationTask,
            }
          };
          return;
        }
        
        // Find tool in tools array
        const toolSelected = tools.find(tool => tool.function.name === toolCall.name);
        if (!toolSelected) {
          step.complete = false;
          step.response = {
            error: `Tool ${toolCall.name} not found`,
            metadata: {
              duration: Date.now() - stepStartTime,
              stepType: step.generationTask,
              toolCall: toolCall,
            }
          };
          return;
        }

        if (toolSelected.function.implementation) {
          const toolResult = await toolSelected.function.implementation(toolCall.args);
          logger.agent.debug('Tool execution result', {
            toolResult,
            toolCall: toolCall,
          });
          step.complete = true;
          step.response = {
            toolCall: {
              name: toolCall.name,
              args: toolCall.args,
              result: toolResult,
            },
            metadata: {
              duration: Date.now() - stepStartTime,
              stepType: step.generationTask,
              ...(thinkingContent ? { thinkingContent } : {}),
            }
          };
          // Add tool use and result to memory
          agentMemory.messages.push(
            {
              role: 'assistant',
              content: JSON.stringify({
                type: 'tool_use',
                name: toolCall.name,
                args: toolCall.args,
              })
            },
            {
              role: 'user',
              content: JSON.stringify({
                type: 'tool_result',
                name: toolCall.name,
                content: JSON.stringify(toolResult),
              })
            }
          );

          return;

        } else {
          logger.agent.warn('Tool implementation not found', {
            toolCall: toolCall,
          });
          step.complete = false;
          step.response = {
            error: 'Tool implementation not found',
            toolCall: toolCall,
            metadata: { 
              duration: Date.now() - stepStartTime,
              stepType: step.generationTask,
              ...(thinkingContent ? { thinkingContent } : {}),
            }
          };
          return;
        }
        
      } else {
        step.complete = true;
        step.response = {
          content: cleanContent,
          metadata: {
            duration: Date.now() - stepStartTime,
            ...(thinkingContent ? { thinkingContent } : {}),
            stepType: step.generationTask,
          }
        };

        // Add tool use and result to memory
        agentMemory.messages.push({
          role: 'assistant',
          content: cleanContent
        });
        
        return;
      }
    } catch (error: any) {
      // TODO: Improve error typing
      step.complete = false;
      step.response = {
        error: error.message,
        metadata: {
          duration: Date.now() - stepStartTime,
          stepType: step.generationTask,
        }
      };
      return;
    }
  }
}

