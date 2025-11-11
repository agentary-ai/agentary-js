import type { 
  MemoryMessage, 
  MemoryCompressor,
  MemoryMessageType
} from '../../types/memory';
import { logger } from '../../utils/logger';

export interface SlidingWindowConfig {
  name: 'sliding-window';
  preserveTypes?: MemoryMessageType[];
}

/**
 * Sliding window memory strategy that keeps recent messages within token limit.
 */
export class SlidingWindowMemory implements MemoryCompressor {
  private config: SlidingWindowConfig;
  
  constructor(config: SlidingWindowConfig) {
    this.config = config;
  }

  async compress(
    messages: MemoryMessage[], 
    targetTokens: number,
    preserveTypes?: string[],
  ): Promise<MemoryMessage[]> {
    const originalCount = messages.length;
    const originalTokens = this.estimateTokens(messages);
    
    // Always preserve these message types
    const alwaysPreserveTypes = ['system_instruction', 'user_prompt', 'summary'];
    
    // Separate messages to preserve by priority
    const priorityMessages = messages.filter(m => 
      m.metadata?.type && alwaysPreserveTypes.includes(m.metadata.type)
    );
    
    const priorityTokens = this.estimateTokens(priorityMessages);
    const remainingTokenBudget = Math.max(0, targetTokens - priorityTokens);
    
    // Get recent messages that fit within remaining budget
    const allMessages = messages.filter(m => 
      !m.metadata?.type || !alwaysPreserveTypes.includes(m.metadata.type)
    );
    
    const recentMessages: MemoryMessage[] = [];
    let tokenCount = 0;
    
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const msg = allMessages[i];
      if (!msg) continue;
      const msgTokens = msg.metadata?.tokenCount || 0;
      
      if (tokenCount + msgTokens > remainingTokenBudget) break;
      
      recentMessages.unshift(msg);
      tokenCount += msgTokens;
    }
    
    const result = [...priorityMessages, ...recentMessages];
    
    logger.agent.info('Memory compressed with sliding window', {
      originalMessageCount: originalCount,
      newMessageCount: result.length,
      removedMessages: originalCount - result.length,
      originalTokens,
      newTokens: this.estimateTokens(result),
      targetTokens
    });
    
    return result;
  }
  
  private estimateTokens(messages: MemoryMessage[]): number {
    return messages.reduce((sum, m) => sum + (m.metadata?.tokenCount || 0), 0);
  }
}

