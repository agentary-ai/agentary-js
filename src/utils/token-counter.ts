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
      if (typeof message.content === 'string') {
        totalChars += message.content.length;
      } else {
        // Handle array of MessageContent
        for (const content of message.content) {
          if (content.type === 'text') {
            totalChars += content.text.length;
          } else if (content.type === 'tool_use') {
            // Tool use id
            totalChars += content.id.length;
            // Tool name
            totalChars += content.name.length;
            // Tool arguments (serialize to JSON for length estimate)
            totalChars += JSON.stringify(content.arguments).length;
            // Overhead for tool use structure
            totalChars += 20;
          } else if (content.type === 'tool_result') {
            // Tool use id
            totalChars += content.tool_use_id.length;
            // Result content
            totalChars += content.result.length;
            // Overhead for tool result structure
            totalChars += 15;
          }
        }
      }
      
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
    let totalChars = 0;
    
    // Account for role
    totalChars += 4;
    
    // Account for content
    if (typeof message.content === 'string') {
      totalChars += message.content.length;
    } else {
      // Handle array of MessageContent
      for (const content of message.content) {
        if (content.type === 'text') {
          totalChars += content.text.length;
        } else if (content.type === 'tool_use') {
          totalChars += content.id.length;
          totalChars += content.name.length;
          totalChars += JSON.stringify(content.arguments).length;
          totalChars += 20; // Overhead for tool use structure
        } else if (content.type === 'tool_result') {
          totalChars += content.tool_use_id.length;
          totalChars += content.result.length;
          totalChars += 15; // Overhead for tool result structure
        }
      }
    }
    
    // Account for formatting
    const formatTokens = 2;
    
    return Math.ceil(totalChars / this.CHARS_PER_TOKEN_ESTIMATE) + formatTokens;
  }
  }