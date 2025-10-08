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
      
      // Account for tool_calls if present
      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          // Tool call id
          totalChars += toolCall.id.length;
          // Tool call type
          totalChars += toolCall.type.length;
          // Function name
          totalChars += toolCall.function.name.length;
          // Function arguments (serialize to JSON for length estimate)
          totalChars += JSON.stringify(toolCall.function.arguments).length;
          // Overhead for tool call structure
          totalChars += 20;
        }
      }
      
      // Account for tool_call_id if present
      if (message.tool_call_id) {
        totalChars += message.tool_call_id.length;
        totalChars += 10; // Overhead for field name and formatting
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
    totalChars += message.content.length;
    
    // Account for tool_calls if present
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        totalChars += toolCall.id.length;
        totalChars += toolCall.type.length;
        totalChars += toolCall.function.name.length;
        totalChars += JSON.stringify(toolCall.function.arguments).length;
        totalChars += 20; // Overhead for tool call structure
      }
    }
    
    // Account for tool_call_id if present
    if (message.tool_call_id) {
      totalChars += message.tool_call_id.length;
      totalChars += 10; // Overhead for field name and formatting
    }
    
    // Account for formatting
    const formatTokens = 2;
    
    return Math.ceil(totalChars / this.CHARS_PER_TOKEN_ESTIMATE) + formatTokens;
  }
  }