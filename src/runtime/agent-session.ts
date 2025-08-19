import { 
  type AgentSession, 
  type WorkflowDefinition, 
  type WorkflowStep, 
  type AgentStepResult, 
  type Tool, 
  type Session,
  type CreateSessionArgs,
  type GenerateArgs,
  type TokenStreamChunk
} from '../types/api';
import { createSession } from './session';

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

    // Register workflow tools
    for (const tool of workflow.tools) {
      this.registerTool(tool);
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
        let stepCompleted = false;
        let nextStepId: string | undefined;

        for await (const result of this.executeStep(step, context)) {
          yield result;
          
          if (result.isComplete) {
            stepCompleted = true;
            nextStepId = result.nextStepId;
            
            // Update context with step results
            context[step.id] = {
              result: result.content,
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
        yield {
          stepId: currentStepId || 'unknown',
          type: 'error',
          content: 'Maximum iterations exceeded',
          isComplete: true,
          error: 'Max iterations'
        };
      }

    } catch (error: any) {
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

      // Create prompt based on step type
      const prompt = this.buildStepPrompt(step, stepContext);

      let stepResult = '';
      let toolCallResult: any = undefined;

      // Generate response
      // TODO: Support worker selection for planning and reasoning
      for await (const chunk of this.session.generate({
        prompt,
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

      // Parse potential tool calls from the result
      const toolCall = this.parseToolCall(stepResult);
      
      if (toolCall && availableTools.length > 0) {
        const tool = availableTools.find(t => t!.function.name === toolCall.name);
        if (tool?.function.implementation) {
          yield {
            stepId: step.id,
            type: 'tool_call',
            content: `Calling tool: ${toolCall.name}`,
            isComplete: false,
            toolCall: toolCall
          };

          try {
            const result = await tool.function.implementation(...Object.values(toolCall.args));
            toolCallResult = result;
            
            yield {
              stepId: step.id,
              type: 'tool_call',
              content: `Tool result: ${JSON.stringify(result)}`,
              isComplete: false,
              toolCall: { ...toolCall, result }
            };
          } catch (error: any) {
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
      }

      // Determine next step based on step type and result
      const nextStepId = this.determineNextStep(step, stepResult, toolCallResult);

      const result: AgentStepResult = {
        stepId: step.id,
        type: this.getResultType(step.type),
        content: stepResult,
        isComplete: true,
        metadata: { 
          duration: Date.now() - stepStartTime,
          stepType: step.type
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

  private buildStepPrompt(step: WorkflowStep, context: Record<string, any>): string {
    let prompt = `
      You are executing step "${step.id}" in a workflow.

      Step Description: ${step.description}
      Step Type: ${step.type}
    `;

    if (context.workflowName) {
      prompt += `Workflow: ${context.workflowName}\n`;
    }

    // Add context from previous steps
    const previousSteps = Object.keys(context).filter(key => 
      key !== 'workflowId' && key !== 'workflowName' && key !== 'startTime' && 
      key !== 'iteration' && key !== 'currentStep' && key !== 'availableTools'
    );

    if (previousSteps.length > 0) {
      prompt += `\nPrevious steps:\n`;
      for (const stepId of previousSteps) {
        const stepData = context[stepId];
        prompt += `- ${stepId}: ${stepData.result}\n`;
      }
    }

    // Add available tools
    if (context.availableTools && context.availableTools.length > 0) {
      prompt += `\nAvailable tools: ${context.availableTools.map((t: Tool) => t.function.name).join(', ')}\n`;
    }

    switch (step.type) {
      case 'think':
        prompt += `\nPlease think through this step and provide your analysis or reasoning.`;
        break;
      case 'act':
        prompt += `\nPlease take action. Use the available tools if needed to complete this step.`;
        break;
      case 'decide':
        prompt += `\nPlease make a decision based on the available information.`;
        break;
      case 'respond':
        prompt += `\nPlease provide a response or summary for this step.`;
        break;
    }

    return prompt;
  }

  private parseToolCall(content: string): { name: string; args: Record<string, any> } | null {
    // Simple tool call parsing - in a real implementation, this would be more sophisticated
    // Look for function call patterns in the generated text
    const toolCallRegex = /(\w+)\((.*?)\)/;
    const match = content.match(toolCallRegex);
    
    if (match && match[1]) {
      try {
        const args = match[2] ? JSON.parse(`{${match[2]}}`) : {};
        return {
          name: match[1],
          args
        };
      } catch {
        // Fallback: try to extract simple key-value pairs
        const simpleArgs: Record<string, any> = {};
        const argPairs = match[2] ? match[2].split(',') : [];
        for (const pair of argPairs) {
          const [key, value] = pair.split(':').map(s => s.trim());
          if (key && value) {
            simpleArgs[key.replace(/['"]/g, '')] = value.replace(/['"]/g, '');
          }
        }
        return {
          name: match[1]!,
          args: simpleArgs
        };
      }
    }
    
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

export async function createAgentSession(args: CreateSessionArgs): Promise<AgentSession> {
  const session = await createSession(args);
  return new AgentSessionImpl(session);
}
