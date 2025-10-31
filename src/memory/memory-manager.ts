import type { Message } from '../types/worker';
import type { Session } from '../types/session';
import type {
  Memory,
  MemoryFormatter,
  MemoryCompressor,
  MemoryMessage,
  MemoryConfig,
  MemoryMetrics,
} from '../types/memory';

import { logger } from '../utils/logger';
import { TokenCounter } from '../utils/token-counter';
import { SlidingWindowMemory } from './implementations/sliding-window-memory';
import { DefaultMemoryFormatter } from './formatters/default-formatter';

/**
 * Manages agent memory including storage, retrieval, compression, and formatting.
 * Encapsulates all memory-related operations and strategies.
 */
export class MemoryManager {
  private memory: Memory;
  private model?: string;
  private formatter: MemoryFormatter;
  private memoryCompressor?: MemoryCompressor;
  private tokenCounter: TokenCounter;
  private config: Required<Pick<MemoryConfig, 'maxTokens' | 'compressionThreshold' | 'preserveMessageTypes'>> & MemoryConfig;
  private session?: Session;
  
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
    
    // Initialize strategies
    this.memory = config?.memory || 
      new SlidingWindowMemory();
    
    this.formatter = config?.formatter || 
      new DefaultMemoryFormatter();
    
    if (config?.memoryCompressor) {
      this.memoryCompressor = config.memoryCompressor;
    }
    
    logger.agent.debug('Memory manager initialized', {
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
      messages,
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
    
    await this.memory.add(messages);
    
    if (!skipCompression) {
      await this.checkAndCompress();
    }
  }
  
  /**
   * Retrieve messages from memory and format them for LLM consumption
   * 
   * @returns A promise that resolves with the formatted messages
   */
  async getMessages(): Promise<Message[]> {
    const memoryMessages = await this.memory.retrieve();
    return this.formatter.formatMessages(memoryMessages);
  }
  
  /**
   * Get current memory metrics
   * 
   * @returns The current memory metrics
   */
  getMetrics(): MemoryMetrics {
    return this.memory.getMetrics();
  }
  
  /**
   * Clear all messages from memory
   */
  clear(): void {
    this.memory.clear();
    logger.agent.debug('Memory cleared');
  }
  
  /**
   * Create a checkpoint for potential rollback
   * 
   * @param id - The ID of the checkpoint
   */
  createCheckpoint(id: string): void {
    if (this.memory.createCheckpoint) {
      this.memory.createCheckpoint(id);
      logger.agent.debug('Created memory checkpoint', { checkpoint: id });
    }
  }
  
  /**
   * Rollback to a previously created checkpoint
   * 
   * @param id - The ID of the checkpoint
   */
  rollbackToCheckpoint(id: string): void {
    if (this.memory.rollback) {
      this.memory.rollback(id);
      logger.agent.debug('Rolled back to checkpoint', { checkpoint: id });
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
    const metrics = this.memory.getMetrics();
    const isNearLimit = metrics.estimatedTokens > this.config.maxTokens * this.config.compressionThreshold;
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
    return this.memory.getMetrics().messageCount;
  }
  
  /**
   * Get current token count
   * 
   * @returns The current token count
   */
  getTokenCount(): number {
    return this.memory.getMetrics().estimatedTokens;
  }
  
  /**
   * Check memory pressure and compress if needed
   */
  private async checkAndCompress(): Promise<void> {

    // TODO: Don't count tokens of preserved messages
    const metrics = this.memory.getMetrics(this.config.preserveMessageTypes);
    const targetTokens = Math.floor(this.config.maxTokens * 0.7);
    
    if (this.isNearLimit()) {
      logger.agent.warn('Memory pressure detected, compressing', {
        currentTokens: metrics.estimatedTokens,
        maxTokens: this.config.maxTokens,
        messageCount: metrics.messageCount
      });

      if (this.memoryCompressor) {
        logger.agent.debug('Using memory compressor', {
          compressor: this.memoryCompressor.name
        });
        const messages = await this.memory.retrieve();
        try {
          const compressed = await this.memoryCompressor.compress(
            messages,
            targetTokens,
            this.model,
            this.session
          );
          
          this.memory.clear();
          await this.memory.add(compressed);
          
          logger.agent.info('Memory compressed', {
            originalCount: messages.length,
            newCount: compressed.length,
            newTokens: this.getTokenCount()
          });
          
        } catch (error: any) {
          logger.agent.error('Memory compressor failed, falling back to pruning', {
            error: error.message,
            messageCount: messages.length
          });
          
          // Fall back to simple pruning if LLM summarization fails
          await this.compressMemory(targetTokens);
        }
      } else if (this.memory.compress) {
        logger.agent.debug('Using simple pruning compression', {
          currentTokens: this.getTokenCount(),
          targetTokens,
          messageCount: this.getMessageCount()
        });
        await this.compressMemory(targetTokens);
      }
    }
  }
  
  /**
   * Fall back to simple message pruning
   * 
   * @param targetTokens - The target token count
   * @returns A promise that resolves when the messages have been compressed
   */
  private async compressMemory(targetTokens: number): Promise<void> {
    if (!this.memory.compress) {
      logger.agent.error('Cannot fall back to pruning: memory implementation does not support compress');
      return;
    }    
    await this.memory.compress({
      targetTokens,
      preserveTypes: this.config.preserveMessageTypes
    });
    logger.agent.info('Memory pruned', {
      newTokens: this.getTokenCount(),
      newMessageCount: this.getMessageCount()
    });
  }
}
