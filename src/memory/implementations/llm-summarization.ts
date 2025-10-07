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
  enableThinking?: boolean;
  recentWindowSize?: number; // Number of recent messages to keep unsummarized
  minMessagesToSummarize?: number; // Minimum messages needed to trigger summarization
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
        `You are summarizing a multi-step AI agent workflow conversation. ` +
        `Your task is to create a concise, data-focused summary that preserves: ` +
        `1. Important data/results from completed tool calls (coordinates, IDs, values, objects) ` +
        `2. Key decisions or selections made ` +
        `3. Critical context needed for future steps ` +
        `Format as brief bullet points listing only essential data and facts. ` +
        `DO NOT use phrases like "Accomplished", "Used the X tool", or describe actions. ` +
        `ONLY state the factual results. For example: ` +
        `- GOOD: "Coordinates: {lat:37.7749, lon:-122.4194}" ` +
        `- BAD: "Accomplished: Using the geocode tool, obtained coordinates..." ` +
        `The summary will be shown to the agent as context before it performs the NEXT tool call. ` +
        `Do NOT include failed attempts, reasoning, or redundant information.`,
      
      userPromptTemplate: config.userPromptTemplate || 
        `Original Task: {userPrompt} ` +
        `Completed Steps: {stepSummaries} ` +
        `Provide a minimal bullet-point summary of data results only. ` +
        `List what data is available for use in the next steps. ` +
        `Keep it under {maxSummaryTokens} tokens. No prose, only facts.`,
      
      temperature: config.temperature ?? 0.1,
      maxSummaryTokens: config.maxSummaryTokens ?? 512,
      enableThinking: config.enableThinking ?? false,
      recentWindowSize: config.recentWindowSize ?? 4,
      minMessagesToSummarize: config.minMessagesToSummarize ?? 6,
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
    
    // 1. Partition messages into preserved, recent, and to-summarize
    const { preserved, recentMessages, toSummarize } = this.partitionMessages(messages);
    
    // 2. Check if summarization should be skipped
    const skipReason = this.shouldSkipSummarization(preserved, recentMessages, toSummarize);
    if (skipReason) {
      logger.agent.debug(skipReason.message, skipReason.details);
      return messages;
    }
    
    try {
      // 3. Generate summary message
      const summaryMessage = await this.generateSummaryMessage(messages, toSummarize, session);
      
      // 4. Fit result within token budget
      const result = this.fitWithinTokenBudget(
        preserved,
        summaryMessage,
        recentMessages,
        targetTokens
      );
      
      return result;
      
    } catch (error: any) {
      logger.agent.error('Failed to summarize messages', {
        error: error.message,
        messageCount: messages.length
      });
      throw error;
    }
  }
  
  /**
   * Partition messages into preserved, recent, and to-summarize groups
   */
  private partitionMessages(messages: MemoryMessage[]): {
    preserved: MemoryMessage[];
    recentMessages: MemoryMessage[];
    toSummarize: MemoryMessage[];
  } {
    const preserved: MemoryMessage[] = [];
    const recentMessages: MemoryMessage[] = [];
    const toSummarize: MemoryMessage[] = [];
    
    // Always preserve these message types
    const alwaysPreserveTypes = ['system_instruction', 'user_prompt', 'summary'];
    
    // Calculate recent window start index
    const recentWindowSize = this.config.recentWindowSize ?? 4;
    const recentStartIndex = Math.max(0, messages.length - recentWindowSize);
    
    messages.forEach((msg, index) => {
      if (msg.metadata?.type && alwaysPreserveTypes.includes(msg.metadata.type)) {
        preserved.push(msg);
      } else if (index >= recentStartIndex) {
        recentMessages.push(msg);
      } else {
        toSummarize.push(msg);
      }
    });
    
    return { preserved, recentMessages, toSummarize };
  }
  
  /**
   * Check if summarization should be skipped and return reason if so
   */
  private shouldSkipSummarization(
    preserved: MemoryMessage[],
    recentMessages: MemoryMessage[],
    toSummarize: MemoryMessage[]
  ): { message: string; details: any } | null {
    const minMessages = this.config.minMessagesToSummarize ?? 6;
    
    if (toSummarize.length === 0) {
      return {
        message: 'No messages to summarize',
        details: {
          preservedCount: preserved.length,
          recentCount: recentMessages.length
        }
      };
    }
    
    if (toSummarize.length < minMessages) {
      return {
        message: 'Not enough messages to justify summarization',
        details: {
          toSummarizeCount: toSummarize.length,
          minRequired: minMessages,
          preservedCount: preserved.length,
          recentCount: recentMessages.length
        }
      };
    }
    
    // Check if the messages to summarize have significant token count
    const toSummarizeTokens = this.tokenCounter.estimateTokens(
      toSummarize.map(m => ({ role: m.role, content: m.content }))
    );
    
    if (toSummarizeTokens < this.config.maxSummaryTokens! * 1.5) {
      return {
        message: 'Messages to summarize do not have enough tokens to justify summarization',
        details: {
          toSummarizeTokens,
          summaryMaxTokens: this.config.maxSummaryTokens,
          threshold: this.config.maxSummaryTokens! * 1.5
        }
      };
    }
    
    return null;
  }
  
  /**
   * Generate a summary message using the LLM
   */
  private async generateSummaryMessage(
    allMessages: MemoryMessage[],
    toSummarize: MemoryMessage[],
    session: Session
  ): Promise<MemoryMessage> {
    // Group messages by workflow step for better summarization
    const stepGroups = this.groupByStep(toSummarize);
    logger.agent.debug('Step groups for summarization', {
      stepGroups
    });
    
    // Format for summarization
    const userPrompt = allMessages.find(m => m.metadata?.type === 'user_prompt')?.content || '';
    const stepSummaries = stepGroups.map(group => 
      this.formatStepGroup(group)
    ).join('\n\n');
    
    const summarizationPrompt = this.config.userPromptTemplate!
      .replace('{userPrompt}', userPrompt)
      .replace('{stepSummaries}', stepSummaries)
      .replace('{maxSummaryTokens}', String(this.config.maxSummaryTokens));
    
    // Generate summary
    let summary = '';
    for await (const chunk of session.createResponse({
      messages: [
        { role: 'system', content: this.config.systemPrompt! },
        { role: 'user', content: summarizationPrompt }
      ],
      temperature: this.config.temperature!,
      max_new_tokens: this.config.maxSummaryTokens!,
      enable_thinking: this.config.enableThinking!
    }, 'chat')) {
      if (!chunk.isLast) {
        summary += chunk.token;
      }
    }
    
    const { cleanContent } = this.contentProcessor.removeThinkTags(summary);
    
    // Format summary as context provided to the assistant, not as an assistant response
    const formattedSummary = `[Context from previous steps]\n${cleanContent}`;
    
    const summaryMessage: MemoryMessage = {
      role: 'user',
      content: formattedSummary,
      metadata: {
        type: 'summary',
        timestamp: Date.now(),
        tokenCount: this.tokenCounter.estimateTokens([{
          role: 'user',
          content: formattedSummary
        }])
      }
    };
    
    logger.agent.info('Message history summarized', {
      summary: cleanContent,
      originalMessageCount: allMessages.length,
      summarizedCount: toSummarize.length,
      summaryLength: cleanContent.length,
      summaryTokens: summaryMessage.metadata?.tokenCount
    });
    
    return summaryMessage;
  }
  
  /**
   * Ensure the result fits within the token budget by adjusting the recent window
   */
  private fitWithinTokenBudget(
    preserved: MemoryMessage[],
    summaryMessage: MemoryMessage,
    recentMessages: MemoryMessage[],
    targetTokens: number
  ): MemoryMessage[] {
    let finalRecentMessages = recentMessages;
    let result = [
      ...preserved,
      summaryMessage,
      ...finalRecentMessages
    ];
    
    // Calculate total tokens for the result
    let resultTokens = this.tokenCounter.estimateTokens(
      result.map(m => ({ role: m.role, content: m.content }))
    );
    
    // If we exceed the target, progressively reduce the recent window
    while (resultTokens > targetTokens && finalRecentMessages.length > 0) {
      logger.agent.warn('Compressed result exceeds target tokens, reducing recent window', {
        resultTokens,
        targetTokens,
        recentWindowSize: finalRecentMessages.length
      });
      
      // Remove the oldest message from the recent window
      finalRecentMessages = finalRecentMessages.slice(1);
      result = [
        ...preserved,
        summaryMessage,
        ...finalRecentMessages
      ];
      
      resultTokens = this.tokenCounter.estimateTokens(
        result.map(m => ({ role: m.role, content: m.content }))
      );
    }
    
    // If we still exceed after removing all recent messages, log a warning
    if (resultTokens > targetTokens) {
      logger.agent.error('Compressed result still exceeds target tokens even with no recent messages', {
        resultTokens,
        targetTokens,
        preservedCount: preserved.length,
        summaryTokens: summaryMessage.metadata?.tokenCount,
        preserved: preserved.map(m => ({
          type: m.metadata?.type,
          tokens: m.metadata?.tokenCount
        }))
      });
    }
    
    logger.agent.debug('Final compressed result', {
      totalTokens: resultTokens,
      targetTokens,
      preservedCount: preserved.length,
      summaryTokens: summaryMessage.metadata?.tokenCount,
      recentCount: finalRecentMessages.length,
      withinBudget: resultTokens <= targetTokens
    });
    
    return result;
  }
  
  shouldCompress(metrics: MemoryMetrics, config: MemoryConfig): boolean {
    const threshold = config.compressionThreshold ?? 0.8;
    const maxTokens = config.maxTokens ?? 1024;
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
  
  /**
   * Group messages by workflow step for structured summarization
   */
  private groupByStep(messages: MemoryMessage[]): MemoryMessage[][] {
    const groups: MemoryMessage[][] = [];
    let currentGroup: MemoryMessage[] = [];
    
    messages.forEach(msg => {
      const type = msg.metadata?.type;
      
      // Start new group on step_prompt
      if (type === 'step_prompt') {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [msg];
      } else {
        currentGroup.push(msg);
      }
    });
    
    // Push final group
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }
  
  /**
   * Format a group of step messages for summarization
   */
  private formatStepGroup(group: MemoryMessage[]): string {
    const stepPrompt = group.find(m => m.metadata?.type === 'step_prompt');
    const toolUse = group.find(m => m.metadata?.type === 'tool_use');
    const toolResult = group.find(m => m.metadata?.type === 'tool_result');
    const stepResult = group.find(m => m.metadata?.type === 'step_result');
    
    let formatted = '';
    
    if (stepPrompt) {
      formatted += `Step: ${stepPrompt.content}\n`;
    }
    
    if (toolUse && toolResult) {
      const toolName = toolUse.tool_calls?.[0]?.function?.name || 'unknown';
      formatted += `  Tool: ${toolName}\n`;
      formatted += `  Result: ${toolResult.content}\n`;
    }
    
    if (stepResult) {
      formatted += `  Output: ${stepResult.content}\n`;
    }
    
    return formatted;
  }
  
  /**
   * Truncate content if it exceeds max length
   */
  private truncateIfNeeded(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '... [truncated]';
  }
}

