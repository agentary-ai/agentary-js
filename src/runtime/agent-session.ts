import { 
  type AgentSession, 
  type WorkflowDefinition, 
  type WorkflowStep, 
  type AgentStepResult, 
  type Tool, 
  type Session,
  type CreateSessionArgs,
  type GenerateArgs,
  type TokenStreamChunk,
  type TaskType
} from '../types/api';
import { createSession } from './session';
import { logger } from '../utils/logger';

export class AgentSessionImpl implements AgentSession {
  private session: Session;
  private tools: Map<string, Tool> = new Map();
  private disposed = false;

  constructor(session: Session) {
    this.session = session;
  }

  // Delegate basic session methods
  async* generate(args: GenerateArgs): AsyncIterable<TokenStreamChunk> {
    if (this.disposed) throw new Error('Agent session disposed');
    
    // Add registered tools to the generation args
    const toolsArray = args.tools ? [...args.tools] : [];
    for (const tool of this.tools.values()) {
      toolsArray.push({
        type: tool.type,
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters
        }
      });
    }

    const generateArgs: GenerateArgs = { ...args };
    if (toolsArray.length > 0) {
      generateArgs.tools = toolsArray;
    }
    yield* this.session.generate(generateArgs);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.session.dispose();
    this.tools.clear();
  }

  // Agent-specific methods
  registerTool(tool: Tool): void {
    if (this.disposed) throw new Error('Agent session disposed');
    this.tools.set(tool.function.name, tool);
  }

  getRegisteredTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  async* runWorkflow(workflow: WorkflowDefinition): AsyncIterable<AgentStepResult> {
    if (this.disposed) throw new Error('Agent session disposed');

    logger.agent.info('Starting workflow execution', { 
      workflowId: workflow.id, 
      workflowName: workflow.name,
      stepCount: workflow.steps.length,
      toolCount: workflow.tools.length 
    });

    // Register workflow tools
    for (const tool of workflow.tools) {
      this.registerTool(tool);
      logger.agent.debug('Registered workflow tool', { toolName: tool.function.name });
    }

    const context: Record<string, any> = {
      workflowId: workflow.id,
      workflowName: workflow.name,
      startTime: Date.now(),
      iteration: 0
    };

    const maxIterations = workflow.maxIterations ?? 10;
    const timeout = workflow.timeout ?? 60000; // 1 minute default
    const startTime = Date.now();

    let currentStepId = workflow.steps[0]?.id;
    let iteration = 0;

    try {
      while (currentStepId && iteration < maxIterations) {
        // Check timeout
        if (Date.now() - startTime > timeout) {
          logger.agent.warn('Workflow timeout exceeded', { 
            workflowId: workflow.id, 
            stepId: currentStepId, 
            elapsedMs: Date.now() - startTime,
            timeoutMs: timeout 
          });
          yield {
            stepId: currentStepId,
            type: 'error',
            content: 'Workflow timeout exceeded',
            isComplete: true,
            error: 'Timeout'
          };
          break;
        }

        const step = workflow.steps.find(s => s.id === currentStepId);
        if (!step) {
          logger.agent.error('Workflow step not found', { 
            workflowId: workflow.id, 
            stepId: currentStepId,
            availableSteps: workflow.steps.map(s => s.id)
          });
          yield {
            stepId: currentStepId,
            type: 'error',
            content: `Step ${currentStepId} not found`,
            isComplete: true,
            error: 'Step not found'
          };
          break;
        }

        // Execute step
        logger.agent.debug('Executing workflow step', { 
          workflowId: workflow.id, 
          stepId: step.id, 
          stepType: step.type,
          iteration: iteration 
        });
        
        let stepCompleted = false;
        let nextStepId: string | undefined;

        for await (const result of this.executeStep(step, context)) {
          logger.agent.debug('Step result', result);
          yield result;
          
          if (result.isComplete) {
            stepCompleted = true;
            nextStepId = result.nextStepId;
            
            // Update context with step results (clean content only, no thinking)
            context[step.id] = {
              result: result.content, // This is already the clean content
              toolCall: result.toolCall,
              metadata: result.metadata
            };
          }
        }

        if (!stepCompleted) break;

        // Determine next step
        if (nextStepId) {
          currentStepId = nextStepId;
        } else if (step.nextSteps?.length) {
          // For now, just take the first next step
          // In the future, this could involve decision logic
          currentStepId = step.nextSteps[0];
        } else {
          // No more steps
          currentStepId = undefined;
        }

        iteration++;
      }

      if (iteration >= maxIterations) {
        logger.agent.warn('Workflow exceeded maximum iterations', { 
          workflowId: workflow.id, 
          maxIterations,
          totalTimeMs: Date.now() - startTime
        });
        yield {
          stepId: currentStepId || 'unknown',
          type: 'error',
          content: 'Maximum iterations exceeded',
          isComplete: true,
          error: 'Max iterations'
        };
      } else {
        logger.agent.info('Workflow completed successfully', { 
          workflowId: workflow.id, 
          iterations: iteration,
          totalTimeMs: Date.now() - startTime
        });
      }

    } catch (error: any) {
      logger.agent.error('Workflow execution failed', { 
        workflowId: workflow.id, 
        stepId: currentStepId,
        error: error.message,
        iterations: iteration,
        totalTimeMs: Date.now() - startTime,
        stack: error.stack
      });
      
      yield {
        stepId: currentStepId || 'unknown',
        type: 'error',
        content: `Workflow error: ${error.message}`,
        isComplete: true,
        error: error.message
      };
    }
  }

  async* executeStep(step: WorkflowStep, context: Record<string, any>): AsyncIterable<AgentStepResult> {
    if (this.disposed) throw new Error('Agent session disposed');

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
      const systemPrompt = this.buildSystemPrompt(step, stepContext);
      const userPrompt = this.buildUserPrompt(step, stepContext);

      let stepResult = '';
      let toolCallResult: any = undefined;

      const taskType = this.getTaskTypeForStep(step);

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
      const { cleanContent, thinkingContent } = this.removeThinkTags(stepResult);
      
      // Parse potential tool calls from the clean content
      const toolCall = this.parseToolCall(cleanContent);
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
        type: this.getResultType(step.type),
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

  private getTaskTypeForStep(step: WorkflowStep): TaskType {
    switch (step.type) {
      case 'think':
        return 'reasoning';
      case 'act':
        return 'function_calling';
      case 'decide':
        return 'reasoning';
      case 'respond':
        return 'chat';
      default:
        return 'chat';
    }
  }

  private buildSystemPrompt(step: WorkflowStep, context: Record<string, any>): string {
    let systemPrompt = `
      You are an AI agent executing workflows step by step.

      Current Workflow: ${context.workflowName || 'Unknown'}
      Current Step: ${step.id} (${step.type})
      Step Objective: ${step.description}
    `;

    // Add available tools to system context
    if (context.availableTools && context.availableTools.length > 0) {
      systemPrompt += `Available Tools: ${context.availableTools.map((t: Tool) => t.function.name).join(', ')}\n\n`;
    }

    // Add thinking tags instruction
    systemPrompt += `\nIMPORTANT: You can use <think></think> tags to show your internal reasoning. Content within these tags will be visible in this step but filtered out before being passed to subsequent steps.\n\n`;

    // Step-specific behavior instructions
    switch (step.type) {
      case 'think':
        systemPrompt += `BEHAVIOR: You are in reasoning mode. Use <think></think> tags to show your internal reasoning process, then provide clear logical reasoning outside the tags. Do not use tools in this step.`;
        break;
      case 'act':
        systemPrompt += `BEHAVIOR: You are in action mode. Use <think></think> tags to plan your approach, then use the available tools to accomplish the objective. 

When you need to call a tool, use this exact format:
<tool_call>
{"name": "tool_name", "arguments": {"param": "value"}}
</tool_call>

Make sure to call the appropriate tools with proper parameters to complete the required actions.`;
        break;
      case 'decide':
        systemPrompt += `BEHAVIOR: You are in decision mode. Use <think></think> tags to evaluate options internally, then provide a clear decision with reasoning outside the tags.`;
        break;
      case 'respond':
        systemPrompt += `BEHAVIOR: You are in response mode. Use <think></think> tags for any internal processing, then provide a clear, helpful, and comprehensive response to the user based on all previous work.`;
        break;
    }

    return systemPrompt;
  }

  private buildUserPrompt(step: WorkflowStep, context: Record<string, any>): string {
    let userPrompt = '';

    // Add context from previous steps
    const previousSteps = Object.keys(context).filter(key => 
      key !== 'workflowId' && key !== 'workflowName' && key !== 'startTime' && 
      key !== 'iteration' && key !== 'currentStep' && key !== 'availableTools'
    );

    if (previousSteps.length > 0) {
      userPrompt += `Previous work completed:\n`;
      for (const stepId of previousSteps) {
        const stepData = context[stepId];
        userPrompt += `- ${stepId}: ${stepData.result}\n`;
      }
      userPrompt += '\n';
    }

    // Extract the actual user task from step description
    // This assumes the user task is appended to step descriptions
    const userTaskMatch = step.description.match(/User's task: "(.+?)"/);
    if (userTaskMatch) {
      userPrompt += `User's original request: "${userTaskMatch[1]}"\n\n`;
    }

    userPrompt += `Please complete the current step: ${step.id}`;

    return userPrompt;
  }

  private removeThinkTags(content: string): { cleanContent: string; thinkingContent: string } {
    // Extract and remove <think></think> tags while preserving the thinking content separately
    const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
    const thinkMatches = content.match(thinkRegex);
    
    // Extract thinking content (without tags)
    const thinkingContent = thinkMatches 
      ? thinkMatches.map(match => match.replace(/<\/?think>/gi, '').trim()).join('\n\n')
      : '';
    
    // Remove <think></think> blocks from the main content
    const cleanContent = content.replace(thinkRegex, '').trim();
    
    return { cleanContent, thinkingContent };
  }

  private parseToolCall(content: string): { name: string; args: Record<string, any> } | null {
    logger.agent.debug('Parsing tool call from content', { content });
    
    // First check if the content itself is a JSON string that needs to be parsed
    // Only attempt this if the content looks like JSON (starts with { and ends with })
    let actualContent = content;
    if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
      try {
        // Try to parse as JSON to see if it's a JSON-encoded object
        const possibleJson = JSON.parse(content);
        if (possibleJson && typeof possibleJson === 'object' && possibleJson.cleanContent) {
          actualContent = possibleJson.cleanContent;
          logger.agent.debug('Extracted cleanContent from JSON wrapper', { actualContent });
        }
      } catch {
        // Not valid JSON, use content as-is
        logger.agent.debug('Content looks like JSON but failed to parse, using as-is');
      }
    }
    
    // Look for tool calls in XML format: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
    // Also handle cases where the closing tag might be missing
    const xmlToolCallRegex = /<tool_call>\s*({.*?})\s*(?:<\/tool_call>|$)/s;
    const xmlMatch = actualContent.match(xmlToolCallRegex);
    
    if (xmlMatch && xmlMatch[1]) {
      logger.agent.debug('Found XML tool call match', { rawMatch: xmlMatch[1] });
      
      try {
        // Handle cases where the JSON might be escaped (from a JSON string)
        let jsonString = xmlMatch[1];
        
        // If it looks like escaped JSON, try to unescape it
        if (jsonString.includes('\\"')) {
          try {
            jsonString = JSON.parse(`"${jsonString}"`);
            logger.agent.debug('Unescaped JSON string', { unescaped: jsonString });
          } catch {
            // If unescaping fails, use the original
            logger.agent.debug('Failed to unescape, using original');
          }
        }
        
        const toolCallData = JSON.parse(jsonString);
        logger.agent.debug('Parsed tool call data', { toolCallData });
        
        if (toolCallData.name) {
          const result = {
            name: toolCallData.name,
            args: toolCallData.arguments || toolCallData.args || {}
          };
          logger.agent.debug('Returning parsed tool call', { result });
          return result;
        }
      } catch (error) {
        logger.agent.warn('Failed to parse XML tool call JSON', { 
          content: xmlMatch[1], 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
    
    // Fallback: Look for simple function call patterns in the generated text
    const functionCallRegex = /(\w+)\((.*?)\)/;
    const functionMatch = content.match(functionCallRegex);
    
    if (functionMatch && functionMatch[1]) {
      try {
        const args = functionMatch[2] ? JSON.parse(`{${functionMatch[2]}}`) : {};
        return {
          name: functionMatch[1],
          args
        };
      } catch {
        // Fallback: try to extract simple key-value pairs
        const simpleArgs: Record<string, any> = {};
        const argPairs = functionMatch[2] ? functionMatch[2].split(',') : [];
        for (const pair of argPairs) {
          const [key, value] = pair.split(':').map(s => s.trim());
          if (key && value) {
            simpleArgs[key.replace(/['"]/g, '')] = value.replace(/['"]/g, '');
          }
        }
        return {
          name: functionMatch[1]!,
          args: simpleArgs
        };
      }
    }
    
    // Additional fallback: Look for JSON tool call patterns without XML tags
    const jsonToolCallRegex = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"(?:arguments|args)"\s*:\s*(\{[^}]*\})\s*\}/;
    const jsonMatch = actualContent.match(jsonToolCallRegex);
    
    if (jsonMatch && jsonMatch[1]) {
      logger.agent.debug('Found JSON tool call match', { match: jsonMatch[0] });
      try {
        const args = JSON.parse(jsonMatch[2] || '{}');
        const result = {
          name: jsonMatch[1],
          args
        };
        logger.agent.debug('Returning JSON parsed tool call', { result });
        return result;
      } catch (error) {
        logger.agent.warn('Failed to parse JSON tool call arguments', { 
          args: jsonMatch[2], 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    logger.agent.debug('No tool call pattern found in content');
    return null;
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

  private getResultType(stepType: string): 'thinking' | 'tool_call' | 'decision' | 'response' | 'error' {
    switch (stepType) {
      case 'think': return 'thinking';
      case 'act': return 'tool_call';
      case 'decide': return 'decision';
      case 'respond': return 'response';
      default: return 'response';
    }
  }
}

export async function createAgentSession(args: CreateSessionArgs = {}): Promise<AgentSession> {
  const session = await createSession(args);
  return new AgentSessionImpl(session);
}
