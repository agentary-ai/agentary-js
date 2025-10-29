export { createSession } from './core/session.js';
export { createAgentSession } from './core/agent-session.js';

export { logger, createLogger, setGlobalLogLevel, LogLevel } from './utils/logger';
export { LogConfigs, getEnvironmentConfig, enableDebuggingMode, disableDebuggingMode, isDebuggingMode } from './utils/logger-config';

// Event system exports
export type {
  SessionEvent,
  EventHandler,
  UnsubscribeFn,
  // Worker events (legacy)
  WorkerInitStartEvent,
  WorkerInitProgressEvent,
  WorkerInitCompleteEvent,
  WorkerDisposedEvent,
  // Provider events (new)
  ProviderInitStartEvent,
  ProviderInitProgressEvent,
  ProviderInitCompleteEvent,
  ProviderRequestStartEvent,
  ProviderRequestCompleteEvent,
  ProviderRateLimitEvent,
  ProviderErrorEvent,
  // Generation events
  GenerationStartEvent,
  GenerationTokenEvent,
  GenerationCompleteEvent,
  GenerationErrorEvent,
  // Memory events
  MemoryCheckpointEvent,
  MemoryRollbackEvent,
  MemoryCompressedEvent,
  MemoryPrunedEvent,
  // Tool events
  ToolCallStartEvent,
  ToolCallCompleteEvent,
  ToolCallErrorEvent,
  // Workflow events
  WorkflowStartEvent,
  WorkflowStepStartEvent,
  WorkflowStepCompleteEvent,
  WorkflowStepRetryEvent,
  WorkflowCompleteEvent,
  WorkflowTimeoutEvent,
  WorkflowErrorEvent,
  // Error events
  ErrorEvent
} from './types/events';

// Memory system exports
export { 
  MemoryManager,
  SlidingWindowMemory,
  LLMSummarization,
  DefaultMemoryFormatter
} from './memory';
export type {
  MemoryMessage,
  RetrievalOptions,
  CompressionOptions,
  MemoryMetrics,
  Memory,
  MemoryFormatter,
  MemoryCompressor,
  ToolResult,
  MemoryConfig,
  LLMSummarizationConfig,
} from './memory';

export type { 
  WorkflowStep,
  WorkflowIterationResponse,
  WorkflowStepError,
  AgentWorkflow,
  AgentSession
} from './types/agent-session';
export type { 
  CreateSessionArgs, 
  TokenStreamChunk, 
  Session, 
  GenerationTask 
} from './types/session';
export type {
  EngineKind,
  WorkerInstance,
  InitArgs,
  MessageContent,
  Message,
  Model,
  Tool,
  GenerateArgs
} from './types/worker';

// Provider system exports (new in v1.5.0)
export type {
  ProviderType,
  BaseProviderConfig,
  LocalProviderConfig,
  OpenAIProviderConfig,
  AnthropicProviderConfig,
  ProviderConfig,
  TokenUsage,
  GenerationMetadata,
  ModelProvider,
  ProviderSessionConfig,
  IProviderFactory
} from './types/provider';

export { ProviderFactory, providerFactory } from './providers/provider-factory';
export { BaseProvider } from './providers/base-provider';
export { LocalProvider } from './providers/local-provider';
export { ProviderManager } from './providers/provider-manager';