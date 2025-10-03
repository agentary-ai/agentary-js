import type { 
  MemoryStrategy, 
  MemoryMessage, 
  RetrievalOptions, 
  CompressionOptions,
  MemoryMetrics 
} from '../../types/memory';
import { TokenCounter } from '../../utils/token-counter';
import { logger } from '../../utils/logger';

/**
 * Sliding window memory strategy that keeps recent messages within token limit.
 * Automatically prunes old messages when approaching the limit.
 */
export class SlidingWindowStrategy implements MemoryStrategy {
  name = 'sliding-window';
  
  private messages: MemoryMessage[] = [];
  private tokenCounter: TokenCounter;
  private maxTokens: number;
  private checkpoints: Map<string, MemoryMessage[]> = new Map();
  private compressionCount = 0;
  private lastCompressionTime?: number;
  
  constructor(maxTokens: number = 2048) {
    this.maxTokens = maxTokens;
    this.tokenCounter = new TokenCounter();
  }
  
  async add(messages: MemoryMessage[]): Promise<void> {
    // Add metadata if missing
    const enrichedMessages = messages.map(msg => ({
      ...msg,
      metadata: {
        timestamp: Date.now(),
        tokenCount: this.tokenCounter.estimateTokens([{ 
          role: msg.role, 
          content: msg.content 
        }]),
        ...msg.metadata
      }
    }));
    
    this.messages.push(...enrichedMessages);
    
    logger.agent.debug('Added messages to memory', {
      addedCount: messages.length,
      totalCount: this.messages.length,
      estimatedTokens: this.getMetrics().estimatedTokens
    });
    
    // Auto-prune if needed
    await this.autoPrune();
  }
  
  async retrieve(options?: RetrievalOptions): Promise<MemoryMessage[]> {
    let filtered = [...this.messages];
    
    // Filter by type
    if (options?.includeTypes) {
      filtered = filtered.filter(m => 
        options.includeTypes!.includes(m.metadata?.type || 'assistant')
      );
    }
    
    if (options?.excludeTypes) {
      filtered = filtered.filter(m => 
        !options.excludeTypes!.includes(m.metadata?.type || 'assistant')
      );
    }
    
    // Filter by timestamp
    if (options?.sinceTimestamp) {
      filtered = filtered.filter(m => 
        (m.metadata?.timestamp || 0) >= options.sinceTimestamp!
      );
    }
    
    // Limit by tokens (take most recent that fit)
    if (options?.maxTokens) {
      const result: MemoryMessage[] = [];
      let tokenCount = 0;
      
      for (let i = filtered.length - 1; i >= 0; i--) {
        const msg = filtered[i];
        const msgTokens = msg.metadata?.tokenCount || 0;
        
        if (tokenCount + msgTokens > options.maxTokens) break;
        
        result.unshift(msg);
        tokenCount += msgTokens;
      }
      
      logger.agent.debug('Retrieved messages with token limit', {
        requestedMaxTokens: options.maxTokens,
        actualTokens: tokenCount,
        messageCount: result.length
      });
      
      return result;
    }
    
    return filtered;
  }
  
  async compress(options?: CompressionOptions): Promise<void> {
    if (!options?.targetTokens) {
      logger.agent.warn('Compression called without target tokens');
      return;
    }
    
    const originalCount = this.messages.length;
    const originalTokens = this.estimateTokens(this.messages);
    
    // Separate messages to preserve
    const priorityMessages = this.messages.filter(m => 
      options.preserveTypes?.includes(m.metadata?.type || '')
    );
    
    const priorityTokens = this.estimateTokens(priorityMessages);
    const remainingTokenBudget = Math.max(0, options.targetTokens - priorityTokens);
    
    // Get recent messages that fit within remaining budget
    const allMessages = this.messages.filter(m => 
      !options.preserveTypes?.includes(m.metadata?.type || '')
    );
    
    const recentMessages: MemoryMessage[] = [];
    let tokenCount = 0;
    
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const msg = allMessages[i];
      const msgTokens = msg.metadata?.tokenCount || 0;
      
      if (tokenCount + msgTokens > remainingTokenBudget) break;
      
      recentMessages.unshift(msg);
      tokenCount += msgTokens;
    }
    
    this.messages = [...priorityMessages, ...recentMessages];
    this.compressionCount++;
    this.lastCompressionTime = Date.now();
    
    logger.agent.info('Memory compressed', {
      originalMessageCount: originalCount,
      newMessageCount: this.messages.length,
      removedMessages: originalCount - this.messages.length,
      originalTokens,
      newTokens: this.estimateTokens(this.messages),
      targetTokens: options.targetTokens,
      compressionCount: this.compressionCount
    });
  }
  
  getMetrics(): MemoryMetrics {
    return {
      messageCount: this.messages.length,
      estimatedTokens: this.estimateTokens(this.messages),
      compressionCount: this.compressionCount,
      lastCompressionTime: this.lastCompressionTime
    };
  }
  
  clear(): void {
    this.messages = [];
    this.checkpoints.clear();
    this.compressionCount = 0;
    this.lastCompressionTime = undefined;
    
    logger.agent.debug('Memory cleared');
  }
  
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
  
  createCheckpoint(id: string): void {
    this.checkpoints.set(id, [...this.messages]);
    logger.agent.debug('Created checkpoint', { 
      checkpoint: id, 
      messageCount: this.messages.length 
    });
  }
  
  private async autoPrune(): Promise<void> {
    const metrics = this.getMetrics();
    const threshold = this.maxTokens * 0.9;
    
    if (metrics.estimatedTokens > threshold) {
      logger.agent.debug('Auto-pruning triggered', {
        currentTokens: metrics.estimatedTokens,
        threshold,
        maxTokens: this.maxTokens
      });
      
      await this.compress({
        targetTokens: Math.floor(this.maxTokens * 0.7),
        preserveTypes: ['system', 'summary']
      });
    }
  }
  
  private estimateTokens(messages: MemoryMessage[]): number {
    return messages.reduce((sum, m) => sum + (m.metadata?.tokenCount || 0), 0);
  }
}

