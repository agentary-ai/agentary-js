import { type Tool } from '../../types/api';

export interface PromptTemplate {
  buildSystemPrompt(stepId: string, stepType: string, description: string, context: Record<string, any>): string;
  buildUserPrompt(stepId: string, description: string, context: Record<string, any>): string;
}

export class BasePromptTemplate implements PromptTemplate {
  buildSystemPrompt(stepId: string, stepType: string, description: string, context: Record<string, any>): string {
    let systemPrompt = `
      You are an AI agent executing workflows step by step.

      Current Workflow: ${context.workflowName || 'Unknown'}
      Current Step: ${stepId} (${stepType})
      Step Objective: ${description}
    `;

    // Add available tools to system context
    if (context.availableTools && context.availableTools.length > 0) {
      systemPrompt += `Available Tools: ${context.availableTools.map((t: Tool) => t.function.name).join(', ')}\n\n`;
    }

    // Add thinking tags instruction
    systemPrompt += `\nIMPORTANT: You can use <think></think> tags to show your internal reasoning. Content within these tags will be visible in this step but filtered out before being passed to subsequent steps.\n\n`;

    return systemPrompt;
  }

  buildUserPrompt(stepId: string, description: string, context: Record<string, any>): string {
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
    const userTaskMatch = description.match(/User's task: "(.+?)"/);
    if (userTaskMatch) {
      userPrompt += `User's original request: "${userTaskMatch[1]}"\n\n`;
    }

    userPrompt += `Please complete the current step: ${stepId}`;

    return userPrompt;
  }
}

export const PROMPT_TEMPLATES = {
  reasoning: new BasePromptTemplate(),
  action: new BasePromptTemplate(),
  decision: new BasePromptTemplate(),
  response: new BasePromptTemplate()
};
