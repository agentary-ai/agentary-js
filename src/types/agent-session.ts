import { Tool } from "./worker";
import { Session } from "./session";
import { MemoryConfig } from "./memory";

export interface WorkflowIterationResponse {
  stepId?: string;
  error?: WorkflowStepError;
  content?: string;
  toolCall?: {
    name?: string;
    args?: Record<string, any>;
    result?: string;
  };
  metadata?: Record<string, any>;
}

export interface WorkflowStepError {
  message: string;
}

export interface WorkflowStep {
  id: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  model: string;
  enableThinking?: boolean;
//   dependentSteps?: number[]; // TODO: Step IDs that must complete before this step
//   nextSteps?: number[];    // TODO: Possible next step IDs after this step
  toolChoice?: string[];
  maxAttempts?: number;
}

export interface Workflow {
  id: string
  systemPrompt?: string;
  context?: Record<string, any>;
  timeout?: number;
  maxIterations?: number;
  steps: WorkflowStep[];
  tools: Tool[];
}

export interface AgentSession extends Session {
  runWorkflow(
    prompt: string, 
    workflow: Workflow, 
    memoryConfig?: MemoryConfig
  ): AsyncIterable<WorkflowIterationResponse>;
  registerTools(tools: Tool[]): void;
  getRegisteredTools(): Tool[];
}