import { Tool, Message } from "./worker";
import { GenerationTask, Session } from "./session";

export type AgentState = 'idle' | 'running' | 'completed' | 'failed';

export interface WorkflowStepResponse {
  error?: string;
  content?: string;
  toolCall?: {
    name?: string;
    args?: Record<string, any>;
    result?: string;
  };
  metadata?: Record<string, any>;
}

export interface WorkflowStepError {
  id: number;
  message: string;
  metadata?: Record<string, any>;
}

export interface WorkflowStep {
  id: number;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  generationTask?: GenerationTask;
//   dependentSteps?: number[]; // TODO: Step IDs that must complete before this step
//   nextSteps?: number[];    // TODO: Possible next step IDs after this step
  toolChoice?: string[];
  maxAttempts?: number;
  attempts?: number;
  complete?: boolean;
  response?: WorkflowStepResponse;
}

export interface AgentMemory {
    messages: Message[]
    context: Record<string, any>;
}

export interface AgentWorkflow {
  id: string
  name: string;
  systemPrompt?: string;
  state?: AgentState;
  memory?: AgentMemory;
  steps: WorkflowStep[];
  tools: Tool[];
  currentIteration?: number;
  maxIterations?: number;
  timeout?: number;
}

// export interface WorkflowStepResult {
//   stepId: number;
//   content?: string;
//   toolCall?: {
//     name: string;
//     args: Record<string, any>;
//     result?: string;
//   };
//   nextStepId?: number; // TODO: use model to determine next step based response if multiple options are specified in step.nextSteps
//   complete: boolean;
//   error?: string;
//   metadata?: Record<string, any>;
// }

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
  runWorkflow(prompt: string, workflow: AgentWorkflow): AsyncIterable<WorkflowStep>;
  registerTool(tool: Tool): void;
  getRegisteredTools(): Tool[];
}