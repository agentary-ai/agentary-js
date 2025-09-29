import { Tool, Model } from "./worker";
import { GenerationTask, Session } from "./session";

export interface WorkflowStepResponse {
  id: string;
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
  description: string; // Short description of the step for persistent agent memory
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  generationTask?: GenerationTask;
//   dependentSteps?: number[]; // TODO: Step IDs that must complete before this step
//   nextSteps?: number[];    // TODO: Possible next step IDs after this step
  toolChoice?: string[];
  maxAttempts?: number;
}

export interface AgentMemoryConfig {
  enableSummarization?: boolean;
}

export interface AgentWorkflow {
  id: string
  name?: string;
  description?: string;
  systemPrompt?: string;
  steps: WorkflowStep[];
  context?: Record<string, any>;
  tools: Tool[];
  timeout?: number;
  maxIterations?: number;
  memoryConfig?: AgentMemoryConfig;
}

export interface AgentSession extends Session {
  runWorkflow(prompt: string, workflow: AgentWorkflow): AsyncIterable<WorkflowStepResponse>;
  registerTool(tool: Tool): void;
  getRegisteredTools(): Tool[];
}