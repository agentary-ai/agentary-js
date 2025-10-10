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
  enableThinking?: boolean;
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
        `List all data is available for use in the next steps. `,
        // `Ensure your response is less than {maxSummaryTokens} tokens.`,
      
      temperature: config.temperature ?? 0.1,
      // maxSummaryTokens: config.maxSummaryTokens ?? 512,
      enableThinking: config.enableThinking ?? false,
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
      messages,
      targetTokens
    });
    
    const { preserved, toSummarize } = this.partitionMessages(messages);
    
    logger.agent.debug('Partitioned messages', {
      preserved,
      toSummarize
    });

    try {
      // 3. Generate summary message
      const summaryMessage = await this.generateSummaryMessage(messages, toSummarize, targetTokens, session);
      
      // 4. Return preserved messages and summary
      return [...preserved, summaryMessage];
      
    } catch (error: any) {
      logger.agent.error('Failed to summarize messages', {
        error: error.message,
        messageCount: messages.length
      });
      throw error;
    }
  }
  
  /**
   * Partition messages into preserved and to-summarize groups
   * Preserved types are kept as-is, all other messages are summarized
   */
  private partitionMessages(messages: MemoryMessage[]): {
    preserved: MemoryMessage[];
    toSummarize: MemoryMessage[];
  } {
    const preserved: MemoryMessage[] = [];
    const toSummarize: MemoryMessage[] = [];
    
    // Always preserve these message types
    const alwaysPreserveTypes = ['system_instruction', 'user_prompt', 'summary'];
    
    messages.forEach((msg) => {
      if (msg.metadata?.type && alwaysPreserveTypes.includes(msg.metadata.type)) {
        preserved.push(msg);
      } else {
        toSummarize.push(msg);
      }
    });
    
    return { preserved, toSummarize };
  }

  /**
   * Generate a summary message using the LLM
   */
  private async generateSummaryMessage(
    allMessages: MemoryMessage[],
    toSummarize: MemoryMessage[],
    targetTokens: number,
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
      // .replace('{maxSummaryTokens}', String(targetTokens));
    
    // Generate summary
    let summary = '';
    for await (const chunk of session.createResponse({
      messages: [
        { role: 'system', content: this.config.systemPrompt! },
        { role: 'user', content: summarizationPrompt }
      ],
      temperature: this.config.temperature!,
      // max_new_tokens: targetTokens,
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
  
  // shouldCompress(metrics: MemoryMetrics, config: MemoryConfig): boolean {
  //   const threshold = config.compressionThreshold ?? 0.8;
  //   const maxTokens = config.maxTokens ?? 512;
  //   const shouldCompress = metrics.estimatedTokens > maxTokens * threshold;
    
  //   if (shouldCompress) {
  //     logger.agent.debug('Compression threshold reached', {
  //       currentTokens: metrics.estimatedTokens,
  //       maxTokens,
  //       threshold,
  //       utilizationPercent: (metrics.estimatedTokens / maxTokens) * 100
  //     });
  //   } else {
  //     logger.agent.debug('Compression threshold not reached', {
  //       currentTokens: metrics.estimatedTokens,
  //       maxTokens,
  //       threshold,
  //       utilizationPercent: (metrics.estimatedTokens / maxTokens) * 100
  //     });
  //   }
    
  //   return shouldCompress;
  // }
  
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
}

