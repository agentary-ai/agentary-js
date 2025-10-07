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
    
    // const memoryMessages = this.convertToMemoryMessages(messages);
    await this.memory.add(messages);
    
    if (!skipCompression) {
      await this.checkAndCompress();
    }
  }
  
  /**
   * Retrieve messages from memory and format them for LLM consumption
   */
  async getMessages(): Promise<Message[]> {
    const memoryMessages = await this.memory.retrieve();
    return this.formatter.formatMessages(memoryMessages);
  }
  
  /**
   * Rollback memory to a specific message count
   */
  async rollbackToCount(targetCount: number): Promise<void> {
    const messages = await this.memory.retrieve();
    const currentCount = messages.length;
    
    if (currentCount > targetCount) {
      this.memory.clear();
      await this.memory.add(messages.slice(0, targetCount));
      
      logger.agent.debug('Rolled back messages', {
        from: currentCount,
        to: targetCount,
        removed: currentCount - targetCount
      });
    }
  }
  
  /**
   * Get current memory metrics
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
   */
  createCheckpoint(id: string): void {
    if (this.memory.createCheckpoint) {
      this.memory.createCheckpoint(id);
      logger.agent.debug('Created memory checkpoint', { checkpoint: id });
    }
  }
  
  /**
   * Rollback to a previously created checkpoint
   */
  rollbackToCheckpoint(id: string): void {
    if (this.memory.rollback) {
      this.memory.rollback(id);
      logger.agent.debug('Rolled back to checkpoint', { checkpoint: id });
    }
  }
  
  /**
   * Format a step instruction using the configured formatter
   */
  formatStepInstruction(stepId: string, prompt: string): string {
    return this.formatter.formatStepInstruction?.(stepId, prompt) 
      || `**Step:** ${stepId}: ${prompt}`;
  }
  
  /**
   * Check if memory usage is near the configured limit
   */
  isNearLimit(): boolean {
    const metrics = this.memory.getMetrics();
    return metrics.estimatedTokens > this.config.maxTokens * this.config.compressionThreshold;
  }
  
  /**
   * Get the message count
   */
  getMessageCount(): number {
    return this.memory.getMetrics().messageCount;
  }
  
  /**
   * Get current token count
   */
  getTokenCount(): number {
    return this.memory.getMetrics().estimatedTokens;
  }
  
  /**
   * Check memory pressure and compress if needed
   */
  private async checkAndCompress(): Promise<void> {
    const metrics = this.memory.getMetrics();
    
    // Use memory compressor if available
    if (this.memoryCompressor?.shouldCompress(metrics, this.config)) {
      logger.agent.warn('Memory pressure detected, compressing', {
        currentTokens: metrics.estimatedTokens,
        maxTokens: this.config.maxTokens,
        messageCount: metrics.messageCount
      });
      
      const messages = await this.memory.retrieve();
      const targetTokens = Math.floor(this.config.maxTokens * 0.6);
      
      try {
        const compressed = await this.memoryCompressor.compress(
          messages,
          targetTokens,
          this.session
        );
        
        // Verify the compressed result actually fits within budget
        const compressedTokens = this.tokenCounter.estimateTokens(
          compressed.map(m => ({ role: m.role, content: m.content }))
        );
        
        if (compressedTokens > targetTokens) {
          logger.agent.warn('Compressed result still exceeds target, falling back to pruning', {
            compressedTokens,
            targetTokens,
            exceedsBy: compressedTokens - targetTokens
          });
          
          // Fall back to simple pruning
          await this.fallbackToPruning(targetTokens);
          return;
        }
        
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
        await this.fallbackToPruning(targetTokens);
      }
    }

    // Fallback to simple pruning if no compressor or not triggered
    else if (this.isNearLimit() && this.memory.compress) {
      await this.fallbackToPruning(Math.floor(this.config.maxTokens * 0.7));
    }
  }
  
  /**
   * Fall back to simple message pruning
   */
  private async fallbackToPruning(targetTokens: number): Promise<void> {
    if (!this.memory.compress) {
      logger.agent.error('Cannot fall back to pruning: memory implementation does not support compress');
      return;
    }
    
    logger.agent.debug('Using simple pruning compression', {
      currentTokens: this.getTokenCount(),
      targetTokens,
      messageCount: this.getMessageCount()
    });
    
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
