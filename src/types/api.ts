import { DataType, DeviceType } from "@huggingface/transformers";

export type EngineKind = DeviceType;
export type TaskType = 'chat' | 'function_calling' | 'planning' | 'reasoning';

export interface CreateSessionArgs {
  models?: {
    chat?: string;
    function_calling?: string;
    planning?: string;
    reasoning?: string;
  }
  adapters?: string[];
  ctx?: number;
  engine?: EngineKind;
  // Optional: Hugging Face access token for private models when using the
  // `hf:` model scheme. Ignored otherwise.
  hfToken?: string;
  quantization?: DataType;
}

export interface GenerateArgs {
  taskType?: TaskType;
  prompt?: string;
  system?: string;
  tools?: unknown[];
  stop?: string[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
  seed?: number;
  deterministic?: boolean;
  retrieval?: {
    queryFn?: (q: string, k: number) => Promise<string[]> | string[];
    k?: number;
  } | null;
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
  generate(args: GenerateArgs): AsyncIterable<TokenStreamChunk>;
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
  runWorkflow(workflow: WorkflowDefinition): AsyncIterable<AgentStepResult>;
  executeStep(step: WorkflowStep, context: Record<string, any>): AsyncIterable<AgentStepResult>;
  registerTool(tool: Tool): void;
  getRegisteredTools(): Tool[];
}