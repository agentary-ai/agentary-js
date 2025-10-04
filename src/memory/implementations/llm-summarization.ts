import type { 
  MemoryCompressor, 
  MemoryMessage, 
  MemoryMetrics, 
  MemoryConfig 
} from '../../types/memory';
import type { Session } from '../../types/session';
import { ContentProcessor } from '../../processing/content/processor';
import { TokenCounter } from '../../utils/token-counter';
import { logger } from '../../utils/logger';

export interface LLMSummarizationConfig {
  systemPrompt?: string;
  userPromptTemplate?: string;
  temperature?: number;
  maxSummaryTokens?: number;
}

/**
 * Compression strategy that uses LLM summarization to condense message history.
 * Generates concise summaries of conversation history to reduce token usage.
 */
export class LLMSummarization implements MemoryCompressor {
  name = 'llm-summarization';
  
  private config: LLMSummarizationConfig;
  private contentProcessor: ContentProcessor;
  private tokenCounter: TokenCounter;
  
  constructor(config: LLMSummarizationConfig = {}) {
    this.config = {
      systemPrompt: config.systemPrompt || 
        'Summarize conversation history into key facts only. Be extremely concise.',
      userPromptTemplate: config.userPromptTemplate || 
        'Summarize this conversation:\n{messages}',
      temperature: config.temperature ?? 0.1,
      maxSummaryTokens: config.maxSummaryTokens ?? 512,
      ...config
    };
    this.contentProcessor = new ContentProcessor();
    this.tokenCounter = new TokenCounter();
  }
  
  async compress(
    messages: MemoryMessage[], 
    targetTokens: number,
    session?: Session
  ): Promise<MemoryMessage[]> {
    if (!session) {
      logger.agent.error('Session required for summarization compression');
      throw new Error('Session required for summarization compression');
    }
    
    if (messages.length === 0) {
      return messages;
    }
    
    logger.agent.debug('Starting message summarization', {
      messageCount: messages.length,
      targetTokens
    });
    
    // Format messages for summarization
    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    
    const userPrompt = this.config.userPromptTemplate!
      .replace('{messages}', conversationText);
    
    try {
      // Generate summary
      let summary = '';
      for await (const chunk of session.createResponse({
        messages: [
          { role: 'system', content: this.config.systemPrompt! },
          { role: 'user', content: userPrompt }
        ],
        temperature: this.config.temperature!,
        max_new_tokens: this.config.maxSummaryTokens!
      }, 'chat')) {
        if (!chunk.isLast) {
          summary += chunk.token;
        }
      }
      
      const { cleanContent } = this.contentProcessor.removeThinkTags(summary);
      
      const summaryMessage: MemoryMessage = {
        role: 'assistant',
        content: cleanContent,
        metadata: {
          type: 'summary',
          timestamp: Date.now(),
          tokenCount: this.tokenCounter.estimateTokens([{
            role: 'assistant',
            content: cleanContent
          }])
        }
      };
      
      logger.agent.info('Message history summarized', {
        originalMessageCount: messages.length,
        summaryLength: cleanContent.length,
        summaryTokens: summaryMessage.metadata?.tokenCount
      });
      
      // Return summarized message
      return [summaryMessage];
      
    } catch (error: any) {
      logger.agent.error('Failed to summarize messages', {
        error: error.message,
        messageCount: messages.length
      });
      throw error;
    }
  }
  
  shouldCompress(metrics: MemoryMetrics, config: MemoryConfig): boolean {
    const threshold = config.compressionThreshold ?? 0.8;
    const maxTokens = config.maxTokens ?? 2048;
    const shouldCompress = metrics.estimatedTokens > maxTokens * threshold;
    
    if (shouldCompress) {
      logger.agent.debug('Compression threshold reached', {
        currentTokens: metrics.estimatedTokens,
        maxTokens,
        threshold,
        utilizationPercent: (metrics.estimatedTokens / maxTokens) * 100
      });
    }
    
    return shouldCompress;
  }
}

