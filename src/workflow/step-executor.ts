import type { Session } from '../types/session'
import type { Tool, GenerateArgs } from '../types/worker';
import type { 
  WorkflowStep,
  WorkflowStepResult,
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
    step: WorkflowStep, agentMemory: AgentMemory, tools: Map<string, Tool>
  ): Promise<WorkflowStepResult> {
    const stepStartTime = Date.now();

    try { 
      // Prepare prompt and add to agent memory
      let prompt = step.prompt;
      if (step.generationTask) {
        prompt = `${step.prompt}${getPromptSuffix(step.generationTask)}`;
      }
      agentMemory.messages.push({
        role: 'user',
        content: prompt
      });

      // Filter out tools by names specified in step.toolChoice
      const toolsArray = Array.from(tools.values())
        .filter(tool => step.toolChoice?.includes(tool.function.name));
      
      const generateArgs: GenerateArgs = {
        messages: agentMemory.messages,
        temperature: 0.1 // Lower temperature for more focused agent behavior
      };
      if (toolsArray.length > 0) {
        generateArgs.tools = toolsArray;
      }

      logger.agent.debug('Generating step response', {
        generateArgs,
        stepType: step.generationTask,
      });
        
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
      
      // Parse potential tool calls from the clean content
      const toolCall = this.toolParser.parse(cleanContent);
      logger.agent.debug('Tool call parsing result', { 
        cleanContent, 
        toolCall, 
      });

      // if (toolCall && tools.length > 0) {
      //   const tool = tools.find(t => t!.function.name === toolCall.name);
      //   logger.agent.debug('Tool found', { tool });
      //   if (tool?.function.function) {
      //     yield {
      //       stepId: step.id,
      //       type: 'tool_call',
      //       content: `Calling tool: ${toolCall.name}`,
      //       isComplete: false,
      //       toolCall: toolCall
      //     };

      //     try {
      //       logger.agent.debug('Calling tool', { toolCall });
      //       const result = await tool.function.implementation(...Object.values(toolCall.args));
      //       toolCallResult = result;
      //       logger.agent.debug('Tool execution result', { result });

      //       yield {
      //         stepId: step.id,
      //         type: 'tool_call',
      //         content: `Tool result: ${JSON.stringify(result)}`,
      //         isComplete: false,
      //         toolCall: { ...toolCall, result }
      //       };
      //     } catch (error: any) {
      //       logger.agent.error('Tool execution failed', { error });
      //       yield {
      //         stepId: step.id,
      //         type: 'error',
      //         content: `Tool execution failed: ${error.message}`,
      //         isComplete: true,
      //         error: error.message
      //       };
      //       return;
      //     }
      //   }
      // } else {
      //   if (!toolCall) {
      //     logger.agent.debug('No tool call detected in content', { cleanContent });
      //   } else if (availableTools.length === 0) {
      //     logger.agent.debug('Tool call detected but no tools available', { toolCall });
      //   }
      // }

      // Determine next step based on step type and result
      const nextStepId = this.determineNextStep(step, cleanContent);

      const result: WorkflowStepResult = {
        stepId: step.id,
        content: cleanContent, // Use cleaned content without <think> tags
        isComplete: true,
        metadata: { 
          duration: Date.now() - stepStartTime,
          stepType: step.generationTask,
          ...(thinkingContent ? { thinkingContent } : {}) // Store thinking separately in metadata
        }
      };
      if (nextStepId) {
        result.nextStepId = nextStepId;
      }
      if (toolCall) {
        // result.toolCall = { ...toolCall, result: toolCallResult };
        result.toolCall = toolCall;
      }
      return result;

    } catch (error: any) {
      return {
        stepId: step.id,
        content: `Step execution failed: ${error.message}`,
        isComplete: true,
        error: error.message
      };
    }
  }

  private determineNextStep(step: WorkflowStep, result: string): number | undefined {
    if (step.nextSteps && step.nextSteps.length === 1) {
      return step.nextSteps[0];
    }
    if (step.nextSteps && step.nextSteps.length > 1) {
      // TODO: Use result/toolResult to determine next step where multiple are available
      return step.nextSteps[0];
    }
    return undefined;
  }
}

