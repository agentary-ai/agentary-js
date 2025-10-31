/**
 * Event types emitted by the SDK for lifecycle monitoring
 */

// Worker lifecycle events
export type WorkerInitStartEvent = {
  type: 'worker:init:start';
  modelName: string;
  timestamp: number;
};

export type WorkerInitProgressEvent = {
  type: 'worker:init:progress';
  modelName: string;
  progress: number; // 0-100
  stage: string;
  timestamp: number;
};

export type WorkerInitCompleteEvent = {
  type: 'worker:init:complete';
  modelName: string;
  duration: number;
  timestamp: number;
};

export type WorkerDisposedEvent = {
  type: 'worker:disposed';
  modelName: string;
  timestamp: number;
};

// Generation events
export type GenerationStartEvent = {
  type: 'generation:start';
  modelName?: string;
  messageCount: number;
  timestamp: number;
};

export type GenerationTokenEvent = {
  type: 'generation:token';
  token: string;
  tokenId: number;
  isFirst: boolean;
  isLast: boolean;
  ttfbMs?: number;
  tokensPerSecond?: number;
  timestamp: number;
};

export type GenerationCompleteEvent = {
  type: 'generation:complete';
  totalTokens: number;
  duration: number;
  tokensPerSecond?: number;
  timestamp: number;
};

export type GenerationErrorEvent = {
  type: 'generation:error';
  error: string;
  timestamp: number;
};

// Memory events
export type MemoryCheckpointEvent = {
  type: 'memory:checkpoint';
  checkpointId: string;
  messageCount: number;
  estimatedTokens: number;
  timestamp: number;
};

export type MemoryRollbackEvent = {
  type: 'memory:rollback';
  checkpointId: string;
  messageCount: number;
  timestamp: number;
};

export type MemoryCompressedEvent = {
  type: 'memory:compressed';
  beforeTokens: number;
  afterTokens: number;
  compressionRatio: number;
  timestamp: number;
};

export type MemoryPrunedEvent = {
  type: 'memory:pruned';
  messagesPruned: number;
  tokensFreed: number;
  timestamp: number;
};

// Tool events
export type ToolCallStartEvent = {
  type: 'tool:call:start';
  stepId?: string;
  toolName: string;
  args: Record<string, any>;
  timestamp: number;
};

export type ToolCallCompleteEvent = {
  type: 'tool:call:complete';
  stepId?: string;
  toolName: string;
  result: any;
  duration: number;
  timestamp: number;
};

export type ToolCallErrorEvent = {
  type: 'tool:call:error';
  stepId?: string;
  toolName: string;
  error: string;
  duration: number;
  timestamp: number;
};

// Workflow events
export type WorkflowStartEvent = {
  type: 'workflow:start';
  workflowId: string;
  stepCount: number;
  timestamp: number;
};

export type WorkflowStepStartEvent = {
  type: 'workflow:step:start';
  workflowId: string;
  stepId: string;
  iteration: number;
  stepPrompt: string;
  timestamp: number;
};

export type WorkflowStepCompleteEvent = {
  type: 'workflow:step:complete';
  workflowId: string;
  stepId: string;
  success: boolean;
  duration: number;
  hasToolCall: boolean;
  hasError: boolean;
  timestamp: number;
};

export type WorkflowStepRetryEvent = {
  type: 'workflow:step:retry';
  workflowId: string;
  stepId: string;
  attempt: number;
  maxAttempts: number;
  reason: string;
  timestamp: number;
};

export type WorkflowCompleteEvent = {
  type: 'workflow:complete';
  workflowId: string;
  totalSteps: number;
  iterations: number;
  duration: number;
  timestamp: number;
};

export type WorkflowTimeoutEvent = {
  type: 'workflow:timeout';
  workflowId: string;
  stepId?: string;
  duration: number;
  timestamp: number;
};

export type WorkflowErrorEvent = {
  type: 'workflow:error';
  workflowId: string;
  stepId?: string;
  error: string;
  timestamp: number;
};

// Generic error event
export type ErrorEvent = {
  type: 'error';
  error: string;
  context?: any;
  timestamp: number;
};

// Union type of all events
export type SessionEvent =
  | WorkerInitStartEvent
  | WorkerInitProgressEvent
  | WorkerInitCompleteEvent
  | WorkerDisposedEvent
  | GenerationStartEvent
  | GenerationTokenEvent
  | GenerationCompleteEvent
  | GenerationErrorEvent
  | MemoryCheckpointEvent
  | MemoryRollbackEvent
  | MemoryCompressedEvent
  | MemoryPrunedEvent
  | ToolCallStartEvent
  | ToolCallCompleteEvent
  | ToolCallErrorEvent
  | WorkflowStartEvent
  | WorkflowStepStartEvent
  | WorkflowStepCompleteEvent
  | WorkflowStepRetryEvent
  | WorkflowCompleteEvent
  | WorkflowTimeoutEvent
  | WorkflowErrorEvent
  | ErrorEvent;

// Event handler type
export type EventHandler<T extends SessionEvent = SessionEvent> = (event: T) => void;

// Event unsubscribe function
export type UnsubscribeFn = () => void;
