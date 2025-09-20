import { Tool, Message } from "./worker";
import { GenerationTask, Session } from "./session";

export type AgentState = 'idle' | 'running' | 'completed' | 'failed';

export interface WorkflowStep {
  id: number;
  name: string;
  generationTask?: GenerationTask;
  prompt: string;
  dependentSteps?: number[]; // Step IDs that must complete before this step
  nextSteps?: number[];    // Possible next step IDs after this step
  toolChoice?: string[];
  maxRetries?: number;
  condition?: string;
}

export interface AgentMemory {
    messages: Message[]
    context: Record<string, any>;
}

export interface AgentWorkflow {
  id: number
  name: string;
//   description: string;
  systemPrompt?: string;
  userPrompt: string;
  state: AgentState;
  memory?: AgentMemory;
  steps: WorkflowStep[];
  tools: Tool[];
  currentIteration?: number;
  maxIterations?: number;
  timeout?: number;
}

export interface WorkflowStepResult {
  stepId: number;
  content: string;
  toolCall?: {
    name: string;
    args: Record<string, any>;
    result?: string;
  };
  isComplete: boolean;
  nextStepId?: number;  // Changed from string to number for consistency
  error?: string;
  metadata?: Record<string, any>;
}

// export interface AgentWorkflowResult {
//   workflowId: string;
//   status: 'running' | 'completed' | 'failed' | 'timeout';
//   currentStepId?: string;
//   steps: AgentStepResult[];
//   finalResult?: string;
//   error?: string;
//   totalDuration?: number;
// }

export interface AgentSession extends Session {
  runWorkflow(prompt: string, workflow: AgentWorkflow): AsyncIterable<WorkflowStepResult>;
  registerTool(tool: Tool): void;
  getRegisteredTools(): Tool[];
}