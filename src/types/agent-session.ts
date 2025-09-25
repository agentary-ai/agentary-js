import { Tool, Message, Model } from "./worker";
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
  id: string;
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

export interface AgentMemoryConfig {
  maxMessages?: number;
  summarizationEnabled?: boolean;
  summarizationModel?: Model;
  summarizationMaxTokens?: number;
}

export interface AgentMemory {
  messages: Message[]
  context: Record<string, any>;
  toolResults?: Record<string, any>;
}

export interface AgentWorkflow {
  id: string
  name: string;
  systemPrompt?: string;
  state?: AgentState;
  memory?: AgentMemory;
  memoryConfig?: AgentMemoryConfig;
  steps: WorkflowStep[];
  tools: Tool[];
  currentIteration?: number;
  maxIterations?: number;
  timeout?: number;
}

export interface AgentSession extends Session {
  runWorkflow(prompt: string, workflow: AgentWorkflow): AsyncIterable<WorkflowStep>;
  registerTool(tool: Tool): void;
  getRegisteredTools(): Tool[];
}