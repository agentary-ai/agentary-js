import { type TaskType } from '../types/api';

export interface StepConfig {
  taskType: TaskType;
  allowTools: boolean;
  promptTemplate: string;
  systemPromptSuffix: string;
}

export const STEP_CONFIGS: Record<string, StepConfig> = {
  think: {
    taskType: 'reasoning',
    allowTools: false,
    promptTemplate: 'reasoning',
    systemPromptSuffix: `BEHAVIOR: You are in reasoning mode. Use <think></think> tags to show your internal reasoning process, then provide clear logical reasoning outside the tags. Do not use tools in this step.`
  },
  act: {
    taskType: 'function_calling',
    allowTools: true,
    promptTemplate: 'action',
    systemPromptSuffix: `BEHAVIOR: You are in action mode. Use <think></think> tags to plan your approach, then use the available tools to accomplish the objective. 

When you need to call a tool, use this exact format:
<tool_call>
{"name": "tool_name", "arguments": {"param": "value"}}
</tool_call>

Make sure to call the appropriate tools with proper parameters to complete the required actions.`
  },
  decide: {
    taskType: 'reasoning',
    allowTools: false,
    promptTemplate: 'decision',
    systemPromptSuffix: `BEHAVIOR: You are in decision mode. Use <think></think> tags to evaluate options internally, then provide a clear decision with reasoning outside the tags.`
  },
  respond: {
    taskType: 'chat',
    allowTools: false,
    promptTemplate: 'response',
    systemPromptSuffix: `BEHAVIOR: You are in response mode. Use <think></think> tags for any internal processing, then provide a clear, helpful, and comprehensive response to the user based on all previous work.`
  }
};

export function getStepConfig(stepType: string): StepConfig {
  const config = STEP_CONFIGS[stepType];
  if (!config) {
    throw new Error(`Unknown step type: ${stepType}`);
  }
  return config;
}

export function getTaskTypeForStep(stepType: string): TaskType {
  return getStepConfig(stepType).taskType;
}

export function getResultType(stepType: string): 'thinking' | 'tool_call' | 'decision' | 'response' | 'error' {
  switch (stepType) {
    case 'think': return 'thinking';
    case 'act': return 'tool_call';
    case 'decide': return 'decision';
    case 'respond': return 'response';
    default: return 'response';
  }
}
