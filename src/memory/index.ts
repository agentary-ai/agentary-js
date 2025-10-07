// Memory manager
export { MemoryManager } from './memory-manager';

// Memory strategies
export { SlidingWindowMemory } from './implementations/sliding-window-memory';
export { LLMSummarization } from './implementations/llm-summarization';
export type { LLMSummarizationConfig } from './implementations/llm-summarization';

// Memory formatters
export { DefaultMemoryFormatter } from './formatters/default-formatter';
export type { FormatterConfig } from './formatters/default-formatter';

// Re-export types
export type {
  MemoryMessage,
  RetrievalOptions,
  CompressionOptions,
  MemoryMetrics,
  Memory,
  MemoryFormatter,
  MemoryCompressor,
  ToolResult,
  MemoryConfig
} from '../types/memory';

