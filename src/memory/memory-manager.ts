import type { Message } from '../types/worker';
import type { Session } from '../types/session';
import type {
  MemoryFormatter,
  MemoryCompressorConfig,
  MemoryMessage,
  MemoryConfig,
  MemoryMetrics,
  MemoryMessageType,
  MemoryCompressor,
  SlidingWindowConfig,
  SummarizationConfig,
} from '../types/memory';

import { logger } from '../utils/logger';
import { TokenCounter } from '../utils/token-counter';
import { SlidingWindowMemory } from './compression-utils/sliding-window-memory';
import { DefaultMemoryFormatter } from './formatters/default-formatter';
import { Summarization } from './compression-utils/summarization';

/**
 * Manages agent memory including storage, retrieval, compression, and formatting.
 * Encapsulates all memory-related operations and strategies.
 */
export class MemoryManager {
  private formatter: MemoryFormatter;
  private memoryCompressor?: MemoryCompressor;
  private tokenCounter: TokenCounter;
  private config: MemoryConfig;
  private session?: Session;
  private messages: MemoryMessage[] = [];
  private checkpoints: Map<string, MemoryMessage[]> = new Map();
  private compressionCount = 0;
  private lastCompressionTime: number | undefined;

  constructor(session: Session, config?: MemoryConfig) {
    this.session = session;
    this.tokenCounter = new TokenCounter();
    
    // Set defaults
    this.config = {
      maxTokens: config?.maxTokens || 1024,
      compressionThreshold: config?.compressionThreshold || 0.8,
      preserveMessageTypes: config?.preserveMessageTypes || ['system_instruction', 'user_prompt', 'summary'],
      ...config
    };
    
    // Setup formatter
    this.formatter = config?.formatter || 
      new DefaultMemoryFormatter();
    
    // Setup memory compressor - support both string and instance
    switch(this.config.memoryCompressorConfig?.name) {
      case 'sliding-window':
        this.memoryCompressor = new SlidingWindowMemory(
          this.config.memoryCompressorConfig as SlidingWindowConfig
        );
        break;
      case 'summarization':
        this.memoryCompressor = new Summarization(
          this.config.memoryCompressorConfig as SummarizationConfig
        );
        break;
    }
    
    logger.agent.info('Memory manager created', {
      maxTokens: this.config.maxTokens,
      compressionThreshold: this.config.compressionThreshold,
      hasMemoryCompressor: !!this.memoryCompressor
    });
  }
  
  /**
   * Add messages to memory with optional compression check
   * 
   * @param messages - The messages to add to memory
   * @param skipCompression - Whether to skip compression
   * @returns A promise that resolves when the messages have been added to memory
   */
  async addMessages(messages: MemoryMessage[], skipCompression = false): Promise<void> {
    logger.agent.debug('Adding messages to memory', {
      messageCount: messages.length,
      skipCompression
    });
    messages = messages.map(m => ({
      ...m,
      metadata: {
        timestamp: Date.now(),
        tokenCount: this.tokenCounter.estimateTokens([m]),
        ...m.metadata
      }
    }));

    await this.messages.push(...messages);
    
    if (!skipCompression) {
      const beforeCount = this.messages.length;
      await this.compress();
      const afterCount = this.messages.length;
      
      if (beforeCount !== afterCount) {
        logger.agent.info('Memory compressed', {
          beforeCount,
          afterCount,
          compressionCount: this.compressionCount,
        });
      }
    }
  }
  
  /**
   * Retrieve messages from memory and format them for model consumption
   * 
   * @returns A promise that resolves with the formatted messages
   */
  async getMessages(): Promise<Message[]> {
    return this.formatter.formatMessages(this.messages);
  }
  
  /**
   * Get current memory metrics
   * 
   * @returns The current memory metrics
   */
  getMetrics(messageTypes?: MemoryMessageType[]): MemoryMetrics {
    // Filter messages by type if specified
    const messagesToCount = (messageTypes && messageTypes.length > 0)
      ? this.messages.filter(m => 
          m.metadata?.type && messageTypes.includes(m.metadata.type)
        )
      : this.messages;
    
    return {
      messageCount: messagesToCount.length,
      estimatedTokens: this.messages.reduce((sum, m) => sum + (m.metadata?.tokenCount || 0), 0),
      compressionCount: this.compressionCount,
      lastCompressionTime: this.lastCompressionTime
    };
  }
  
  /**
   * Clear all messages from memory
   */
  clear(): void {
    this.messages = [];
    this.checkpoints.clear();
    this.compressionCount = 0;
    this.lastCompressionTime = undefined;
    logger.agent.debug('Memory cleared');
  }

  /**
   * Rollback to a previously created checkpoint
   * 
   * @param checkpoint - The ID of the checkpoint
   */
  rollback(checkpoint: string): void {
    const checkpointMessages = this.checkpoints.get(checkpoint);
    if (checkpointMessages) {
      this.messages = [...checkpointMessages];
      logger.agent.debug('Rolled back to checkpoint', { 
        checkpoint, 
        messageCount: this.messages.length 
      });
    } else {
      logger.agent.warn('Checkpoint not found', { checkpoint });
    }
  }
  
  /**
   * Create a checkpoint for potential rollback
   * 
   * @param id - The ID of the checkpoint
   */
  createCheckpoint(id: string): void {
    this.checkpoints.set(id, [...this.messages]);
    logger.agent.debug('Created checkpoint', { 
      checkpoint: id, 
      messageCount: this.messages.length 
    });
  }
  
  /**
   * Rollback to a previously created checkpoint
   * 
   * @param id - The ID of the checkpoint
   */
  rollbackToCheckpoint(id: string): void {
    const checkpointMessages = this.checkpoints.get(id);
    if (checkpointMessages) {
      this.messages = [...checkpointMessages];
      logger.agent.debug('Rolled back to checkpoint', { 
        checkpoint: id, 
        messageCount: this.messages.length 
      });
    } else {
      logger.agent.warn('Checkpoint not found', { checkpoint: id });
    }
  }
  
  /**
   * Format a step instruction using the configured formatter
   * 
   * @param stepId - The ID of the step
   * @param prompt - The prompt to format
   * @returns The formatted step instruction
   */
  formatStepInstruction(stepId: string, prompt: string): string {
    return this.formatter.formatStepInstruction?.(stepId, prompt) 
      || `**Step:** ${stepId}: ${prompt}`;
  }
  
  /**
   * Check if memory usage is near the configured limit
   * 
   * @returns True if memory usage is near the configured limit, false otherwise
   */ 
  isNearLimit(): boolean {
    const metrics = this.getMetrics();
    const isNearLimit = metrics.estimatedTokens > this.config.maxTokens! * this.config.compressionThreshold!;
    if (isNearLimit) {
      logger.agent.warn('Memory is near limit', {
        estimatedTokens: metrics.estimatedTokens,
        maxTokens: this.config.maxTokens,
        compressionThreshold: this.config.compressionThreshold,
        messageCount: metrics.messageCount
      });
    }
    return isNearLimit;
  }
  
  /**
   * Get the message count
   * 
   * @returns The message count
   */
  getMessageCount(): number {
    return this.getMetrics().messageCount;
  }
  
  /**
   * Get the total token count for all messages
   * 
   * @returns The total token count
   */
  getTokenCount(): number {
    return this.getMetrics().estimatedTokens;
  }
  
  /**
   * Check memory pressure and compress if needed
   */
  private async compress(): Promise<void> {
    const targetTokens = Math.floor(this.config.maxTokens! * 0.7);
    
    if (this.isNearLimit()) {
      if (this.memoryCompressor) {
        // logger.agent.debug('Using memory compressor', {
        //   compressor: this.memoryCompressor.name
        // });
        try {
          const compressed = await this.memoryCompressor.compress(
            this.messages,
            targetTokens,
            this.config.preserveMessageTypes,
            this.session
          );
          
          // Replace messages without triggering compression again
          this.messages = compressed;
          this.compressionCount++;
          this.lastCompressionTime = Date.now();
          
          logger.agent.info('Memory compressed', {
            tokenCount: this.getTokenCount(),
            messageCount: this.messages.length,
            compressionCount: this.compressionCount
          });
          
        } catch (error: any) {
          logger.agent.error('Memory compression failed', {
            error: error.message,
          });
        }
      }
    }
  }
}