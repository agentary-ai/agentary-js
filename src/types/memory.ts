import type { Message, MessageRole } from './worker';
import type { Session } from './session';

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

// Options for retrieving messages from memory
export interface RetrievalOptions {
  maxTokens?: number;
  includeTypes?: string[];
  excludeTypes?: string[];
  sinceTimestamp?: number;
  relevanceQuery?: string; // For future semantic search support
}

// Options for compressing memory
export interface CompressionOptions {
  targetTokens?: number;
  // strategy?: 'prune' | 'summarize' | 'hybrid';
  preserveTypes?: MemoryMessageType[]; // Message types to never compress
}

// Memory metrics for monitoring
export interface MemoryMetrics {
  messageCount: number;
  estimatedTokens: number;
  compressionCount: number;
  lastCompressionTime: number | undefined;
}

// Main memory interface
export interface Memory {
  name: string;
  
  // Add messages to memory
  add(messages: MemoryMessage[]): Promise<void>;
  
  // Retrieve messages for context
  retrieve(options?:  RetrievalOptions): Promise<MemoryMessage[]>;
  
  // Compress/summarize when needed
  compress?(options?: CompressionOptions): Promise<void>;
  
  // Get current memory metrics
  getMetrics(messageTypes?: MemoryMessageType[]): MemoryMetrics;
  
  // Clear or reset memory
  clear(): void;
  
  // Rollback to previous state
  rollback?(checkpoint: string): void;
  
  // Create checkpoint for rollback
  createCheckpoint?(id: string): void;
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
  name: string;
  
  // Compress messages
  compress(
    messages: MemoryMessage[], 
    targetTokens: number,
    session?: Session
  ): Promise<MemoryMessage[]>;
  
  // Estimate if compression is needed
  // shouldCompress(metrics: MemoryMetrics, config: MemoryConfig): boolean;
}

// Tool result type
export interface ToolResult {
  name: string;
  description: string;
  result: string;
}

// Memory configuration
export interface MemoryConfig {
  memory?: Memory;
  preserveMessageTypes?: MemoryMessageType[];
  formatter?: MemoryFormatter;
  memoryCompressor?: MemoryCompressor;
  maxTokens?: number;
  compressionThreshold?: number; // 0-1, percentage of maxTokens
  autoCompress?: boolean;
  checkpointInterval?: number; // For rollback support
}

