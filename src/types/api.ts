import { DataType, DeviceType } from "@huggingface/transformers";
import { WorkerManager } from "../workers/manager";
import { GenerateArgs } from "./worker";

export type EngineKind = DeviceType;
export type GenerationTask = 'chat' | 'function_calling' | 'planning' | 'reasoning';

export interface CreateSessionArgs {
  models?: {
    chat?: {
      name: string;
      quantization: DataType;
    };
    function_calling?: {
      name: string;
      quantization: DataType;
    };
    planning?: {
      name: string;
      quantization: DataType;
    };
    reasoning?: {
      name: string;
      quantization: DataType;
    };
  }
  adapters?: string[];
  ctx?: number;
  engine?: EngineKind;
  // Optional: Hugging Face access token for private models when using the
  // `hf:` model scheme. Ignored otherwise.
  hfToken?: string;
}

export interface WorkerInstance {
  worker: Worker;
  model: Model;
  initialized: boolean;
  disposed: boolean;
  inflightId: number;
}

export interface Model {
  name: string;
  quantization: DataType;
}

export interface TokenStreamChunk {
  token: string;
  tokenId: number;
  isFirst: boolean;
  isLast: boolean;
  ttfbMs?: number;
  tokensPerSecond?: number;
}

export interface Session {
  workerManager: WorkerManager;
  createResponse(args: GenerateArgs, generationTask?: GenerationTask): AsyncIterable<TokenStreamChunk>;
  dispose(): Promise<void>;
}

// Agent workflow types
export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
    implementation?: (...args: any[]) => Promise<any> | any;
  };
}

export interface WorkflowStep {
  id: string;
  type: 'think' | 'act' | 'decide' | 'respond';
  description: string;
  condition?: string;
  tools?: string[];
  nextSteps?: string[];
  maxRetries?: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  tools: Tool[];
  maxIterations?: number;
  timeout?: number;
}

export interface AgentStepResult {
  stepId: string;
  type: 'thinking' | 'tool_call' | 'decision' | 'response' | 'error';
  content: string;
  toolCall?: {
    name: string;
    args: Record<string, any>;
    result?: any;
  };
  isComplete: boolean;
  nextStepId?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface AgentWorkflowResult {
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  currentStepId?: string;
  steps: AgentStepResult[];
  finalResult?: string;
  error?: string;
  totalDuration?: number;
}

export interface AgentSession extends Session {
  runWorkflow(prompt: string, workflow: WorkflowDefinition): AsyncIterable<AgentStepResult>;
  executeStep(step: WorkflowStep, context: Record<string, any>): AsyncIterable<AgentStepResult>;
  registerTool(tool: Tool): void;
  getRegisteredTools(): Tool[];
}