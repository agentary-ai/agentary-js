import { type WorkflowStep, type Tool } from '../types/api';

export class PromptBuilder {
  buildSystemPrompt(step: WorkflowStep, context: Record<string, any>): string {
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

  buildUserPrompt(step: WorkflowStep, context: Record<string, any>): string {
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
}

