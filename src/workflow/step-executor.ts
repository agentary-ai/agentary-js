import { 
  type WorkflowStep, 
  type AgentStepResult, 
  type Tool, 
  type Session
} from '../types/api';
import { logger } from '../utils/logger';
import { PromptBuilder } from '../processing/prompts/builder';
import { ToolCallParser } from '../processing/tools/parser';
import { ContentProcessor } from '../processing/content/processor';
import { getTaskTypeForStep, getResultType } from './step-configs';

export class StepExecutor {
  private session: Session;
  private tools: Map<string, Tool>;
  private promptBuilder: PromptBuilder;
  private toolCallParser: ToolCallParser;
  private contentProcessor: ContentProcessor;

  constructor(
    session: Session, 
    tools: Map<string, Tool>,
    promptBuilder?: PromptBuilder,
    toolCallParser?: ToolCallParser,
    contentProcessor?: ContentProcessor
  ) {
    this.session = session;
    this.tools = tools;
    this.promptBuilder = promptBuilder || new PromptBuilder();
    this.toolCallParser = toolCallParser || new ToolCallParser();
    this.contentProcessor = contentProcessor || new ContentProcessor();
  }

  async* execute(step: WorkflowStep, context: Record<string, any>): AsyncIterable<AgentStepResult> {
    const stepStartTime = Date.now();

    try {
      const availableTools = step.tools?.map(toolName => this.tools.get(toolName)).filter(Boolean) || [];
        
      // Build step context
      const stepContext = {
        ...context,
        currentStep: step,
        availableTools,
      };

      yield {
        stepId: step.id,
        type: 'thinking',
        content: `Starting step: ${step.description}`,
        isComplete: false,
        metadata: { startTime: stepStartTime }
      };

      // Create system and user prompts
      const systemPrompt = this.promptBuilder.buildSystemPrompt(step, stepContext);
      const userPrompt = this.promptBuilder.buildUserPrompt(step, stepContext);

      let stepResult = '';
      let toolCallResult: any = undefined;

      const taskType = getTaskTypeForStep(step.type);

      // Generate response
      for await (const chunk of this.session.generate({
        system: systemPrompt,
        prompt: userPrompt,
        taskType,
        tools: availableTools.map(tool => ({
          type: tool!.type,
          function: {
            name: tool!.function.name,
            description: tool!.function.description,
            parameters: tool!.function.parameters
          }
        })),
        temperature: 0.1 // Lower temperature for more focused agent behavior
      })) {
        if (!chunk.isLast) {
          stepResult += chunk.token;
        }
      }

      logger.agent.debug('Step result', { stepResult, stepType: step.type, availableToolNames: availableTools.map(t => t?.function.name) });

      // Filter out thinking tags and extract clean content
      const { cleanContent, thinkingContent } = this.contentProcessor.removeThinkTags(stepResult);
      
      // Parse potential tool calls from the clean content
      const toolCall = this.toolCallParser.parse(cleanContent);
      logger.agent.debug('Tool call parsing result', { 
        cleanContent, 
        toolCall, 
        availableToolsCount: availableTools.length,
        availableToolNames: availableTools.map(t => t?.function.name)
      });

      if (toolCall && availableTools.length > 0) {
        const tool = availableTools.find(t => t!.function.name === toolCall.name);
        logger.agent.debug('Tool found', { tool });
        if (tool?.function.implementation) {
          yield {
            stepId: step.id,
            type: 'tool_call',
            content: `Calling tool: ${toolCall.name}`,
            isComplete: false,
            toolCall: toolCall
          };

          try {
            logger.agent.debug('Calling tool', { toolCall });
            const result = await tool.function.implementation(...Object.values(toolCall.args));
            toolCallResult = result;
            logger.agent.debug('Tool execution result', { result });

            yield {
              stepId: step.id,
              type: 'tool_call',
              content: `Tool result: ${JSON.stringify(result)}`,
              isComplete: false,
              toolCall: { ...toolCall, result }
            };
          } catch (error: any) {
            logger.agent.error('Tool execution failed', { error });
            yield {
              stepId: step.id,
              type: 'error',
              content: `Tool execution failed: ${error.message}`,
              isComplete: true,
              error: error.message
            };
            return;
          }
        }
      } else {
        if (!toolCall) {
          logger.agent.debug('No tool call detected in content', { cleanContent });
        } else if (availableTools.length === 0) {
          logger.agent.debug('Tool call detected but no tools available', { toolCall });
        }
      }

      // Determine next step based on step type and result
      const nextStepId = this.determineNextStep(step, cleanContent, toolCallResult);

      const result: AgentStepResult = {
        stepId: step.id,
        type: getResultType(step.type),
        content: cleanContent, // Use cleaned content without <think> tags
        isComplete: true,
        metadata: { 
          duration: Date.now() - stepStartTime,
          stepType: step.type,
          ...(thinkingContent ? { thinkingContent } : {}) // Store thinking separately in metadata
        }
      };
      if (nextStepId) {
        result.nextStepId = nextStepId;
      }
      if (toolCall) {
        result.toolCall = { ...toolCall, result: toolCallResult };
      }
      yield result;

    } catch (error: any) {
      yield {
        stepId: step.id,
        type: 'error',
        content: `Step execution failed: ${error.message}`,
        isComplete: true,
        error: error.message
      };
    }
  }



  private determineNextStep(step: WorkflowStep, result: string, toolResult: any): string | undefined {
    // Simple next step determination - in a real implementation, this could be more sophisticated
    if (step.nextSteps && step.nextSteps.length === 1) {
      return step.nextSteps[0];
    }
    
    if (step.nextSteps && step.nextSteps.length > 1) {
      // For now, just return the first option
      // In the future, this could involve analyzing the result to choose the appropriate path
      return step.nextSteps[0];
    }
    
    return undefined;
  }


}

