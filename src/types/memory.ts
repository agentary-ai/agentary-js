import type { Message } from './worker';
import type { Session } from './session';
import type { SummarizationConfig } from '../memory/compression-utils/summarization';
import type { SlidingWindowConfig } from '../memory/compression-utils/sliding-window-memory';

export type { SummarizationConfig, SlidingWindowConfig };

export type MemoryMessageType = 
  'system_instruction' | 'user_prompt' | 'step_prompt' | 
  'step_result' | 'tool_use' | 'tool_result' | 'summary';

// Core memory message with metadata
export interface MemoryMessage extends Message {
  metadata?: {
    timestamp?: number;
    stepId?: string;
    priority?: number;
    tokenCount?: number;
    type?: MemoryMessageType;
  };
}

// Memory metrics for monitoring
export interface MemoryMetrics {
  messageCount: number;
  estimatedTokens: number;
  compressionCount: number;
  lastCompressionTime: number | undefined;
}

// Formatter interface for decoupling prompt construction
export interface MemoryFormatter {
  // Format messages for LLM consumption
  formatMessages(messages: MemoryMessage[]): Message[];
  
  // Format tool results
  formatToolResults?(results: Record<string, ToolResult>): string;
  
  // Format step instructions
  formatStepInstruction?(stepId: string, prompt: string): string;
  
  // Format system prompt with context
  formatSystemPrompt?(basePrompt: string, context?: string): string;
}

// Compression strategy interface
export interface MemoryCompressor {
  // Compress messages
  compress(
    messages: MemoryMessage[], 
    targetTokens: number,
    preserveTypes?: string[],
    session?: Session
  ): Promise<MemoryMessage[]>;
}

// Tool result type
export interface ToolResult {
  name: string;
  description: string;
  result: string;
}

export type MemoryCompressorConfig = SlidingWindowConfig | SummarizationConfig;

// Memory configuration
export interface MemoryConfig {
  preserveMessageTypes?: MemoryMessageType[];
  formatter?: MemoryFormatter;
  memoryCompressorConfig?: MemoryCompressorConfig;
  maxTokens?: number;
  compressionThreshold?: number; // 0-1, percentage of maxTokens
}

