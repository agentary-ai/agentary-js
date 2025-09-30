import type { Message } from '../types/worker';

export class TokenCounter {
    private readonly CHARS_PER_TOKEN_ESTIMATE = 4; // Conservative estimate
    
    /**
     * Estimates token count for messages
     * In production, consider using tiktoken or the model's actual tokenizer
     */
    estimateTokens(messages: Message[], method: string = 'simple'): number {
      switch (method) {
        case 'simple':
          return this.simpleTokenEstimate(messages);
        case 'tiktoken':
          // TODO: Implement actual tiktoken counting
          // import { encoding_for_model } from '@dqbd/tiktoken';
          return this.simpleTokenEstimate(messages);
        default:
          return this.simpleTokenEstimate(messages);
      }
    }
  
    private simpleTokenEstimate(messages: Message[]): number {
      let totalChars = 0;
      
      for (const message of messages) {
        // Account for role tokens (usually 1-2 tokens)
        totalChars += 4; 
        
        // Account for message content
        totalChars += message.content.length;
        
        // Account for message separators/formatting
        totalChars += 4;
      }
      
      // Add buffer for special tokens
      return Math.ceil(totalChars / this.CHARS_PER_TOKEN_ESTIMATE) + messages.length * 2;
    }
  
    /**
     * Estimates tokens for a single message
     */
    estimateMessageTokens(message: Message): number {
      const roleTokens = 2;
      const contentTokens = Math.ceil(message.content.length / this.CHARS_PER_TOKEN_ESTIMATE);
      const formatTokens = 2;
      return roleTokens + contentTokens + formatTokens;
    }
  }