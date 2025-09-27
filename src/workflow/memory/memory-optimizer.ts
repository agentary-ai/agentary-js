// import type { AgentMemoryConfig } from '../../types/agent-session';
// import type { Message, Model, GenerateArgs } from '../../types/worker';
// import type { Session } from '../../types/session';
// import { logger } from '../../utils/logger';
// import { TokenCounter } from '../../utils/token-counter';
// import { ContentProcessor } from '../../processing/content/processor';
// import { WorkflowState } from '../workflow-state';

// export class MemoryOptimizer {
//   private tokenCounter: TokenCounter;
//   private contentProcessor: ContentProcessor;
//   private session: Session;

//   constructor(session: Session) {
//     this.tokenCounter = new TokenCounter();
//     this.contentProcessor = new ContentProcessor();
//     this.session = session;
//   }

//   async optimizeMemory(
//     state: WorkflowState
//   ): Promise<void> {
//     const memoryConfig = state.workflow.memoryConfig;
//     const agentMemory = state.memory;

//     if (!memoryConfig?.summarizationEnabled) {
//       return;
//     }

//     const maxTokens = memoryConfig.maxTokens ?? 4096;
//     const threshold = memoryConfig.summarizationThreshold ?? 0.8;
    
//     // Update token count
//     state.currentTokenCount = this.tokenCounter.estimateTokens(agentMemory.messages);
//     state.tokenCountLastUpdated = new Date();

//     logger.agent.debug('Token count check', {
//       currentTokens: state.currentTokenCount,
//       maxTokens,
//       threshold: maxTokens * threshold
//     });

//     if (agentMemory.currentTokenCount >= maxTokens * threshold) {
//       await this.performTokenBasedSummarization(userPrompt, agentMemory, memoryConfig, maxTokens);
//     }
//   }

//   private async performTokenBasedSummarization(
//     userPrompt: string,
//     agentMemory: AgentMemory,
//     memoryConfig: AgentMemoryConfig,
//     maxTokens: number
//   ): Promise<void> {
//     const startTime = Date.now();
//     const systemMessage = agentMemory.messages.find(m => m.role === 'system');
//     const nonSystemMessages = agentMemory.messages.filter(m => m.role !== 'system');
    
//     // Calculate how many tokens we need to free up
//     const targetTokens = maxTokens * 0.6; // Aim for 60% capacity after summarization
//     const tokensToReduce = agentMemory.currentTokenCount! - targetTokens;
    
//     logger.agent.info('Starting token-based summarization', {
//       currentTokens: agentMemory.currentTokenCount,
//       targetTokens,
//       tokensToReduce
//     });
    
//     // Find the split point based on tokens
//     const splitIndex = this.findTokenSplitPoint(
//       nonSystemMessages, 
//       targetTokens,
//       userPrompt
//     );
    
//     const toSummarize = nonSystemMessages.slice(0, splitIndex);
//     const toKeep = nonSystemMessages.slice(splitIndex);
    
//     if (toSummarize.length === 0) {
//       logger.agent.warn('No messages to summarize');
//       return;
//     }
    
//     // Create summary
//     const summary = await this.summarizeMessages(
//       toSummarize,
//       systemMessage,
//       memoryConfig.summarizationModel,
//       memoryConfig.summarizationMaxTokens
//     );
    
//     // Reconstruct messages
//     this.reconstructMessages(
//       agentMemory,
//       systemMessage,
//       userPrompt,
//       summary,
//       toKeep,
//       toSummarize.length
//     );
    
//     logger.agent.info('Token-based summarization completed', {
//       previousTokens: this.tokenCounter.estimateTokens(toSummarize) + this.tokenCounter.estimateTokens(toKeep),
//       currentTokens: agentMemory.currentTokenCount,
//       messagesSummarized: toSummarize.length,
//       messagesKept: toKeep.length,
//       duration: Date.now() - startTime
//     });
//   }

//   private findTokenSplitPoint(
//     nonSystemMessages: Message[], 
//     targetTokens: number,
//     userPrompt: string
//   ): number {
//     let tokenSum = 0;
//     let splitIndex = 0;
    
//     // Find the initial user prompt message index
//     const initialUserMessageIndex = nonSystemMessages.findIndex(
//       m => m.role === 'user' && m.content === userPrompt
//     );
    
//     // Count from the end to determine what to keep
//     for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
//       const messageTokens = this.tokenCounter.estimateMessageTokens(nonSystemMessages[i]!);
//       tokenSum += messageTokens;
      
//       // Never summarize away the initial prompt
//       if (initialUserMessageIndex >= 0 && i <= initialUserMessageIndex) {
//         splitIndex = i;
//         break;
//       }
      
//       if (tokenSum >= targetTokens * 0.5) { // Keep up to 50% of target as recent messages
//         splitIndex = i;
//         break;
//       }
//     }
    
//     return splitIndex;
//   }

//   private reconstructMessages(
//     agentMemory: AgentMemory,
//     systemMessage: Message | undefined,
//     userPrompt: string,
//     summary: string,
//     toKeep: Message[],
//     summarizedCount: number
//   ): void {
//     const hasInitialPrompt = toKeep.some(
//       m => m.role === 'user' && m.content === userPrompt
//     );
    
//     const summaryMessage: Message = {
//       role: 'system',
//       content: `[Context from ${summarizedCount} previous messages]\n${summary}`
//     };
    
//     agentMemory.messages = [
//       ...(systemMessage ? [systemMessage] : []),
//       ...(!hasInitialPrompt ? [{
//         role: 'user' as const,
//         content: userPrompt
//       }] : []),
//       summaryMessage,
//       ...toKeep
//     ];
    
//     // Recalculate token count
//     agentMemory.currentTokenCount = this.tokenCounter.estimateTokens(agentMemory.messages);
//   }

//   private async summarizeMessages(
//     messageHistory: Message[],
//     systemPrompt?: Message,
//     model?: Model,
//     maxTokens?: number
//   ): Promise<string> {
//     const messages: Message[] = [
//       {
//         role: 'system',
//         content: 'You are a conversation summarizer for an AI agent workflow. ' +
//         'Create a concise summary that preserves critical context including:\n' +
//         '- Key decisions made and their outcomes\n' +
//         '- Important tool results and data discovered\n' +
//         '- Current state and progress toward goals\n' +
//         '- Any constraints or requirements identified\n\n' +
//         'Format your response as a clear context statement, NOT as a system prompt.\n' +
//         (systemPrompt ? 
//           `Original system context: "${systemPrompt.content}"\n` : '')
//       },
//       {
//         role: 'user',
//         content: 'Summarize these workflow messages into a context statement:\n\n' + 
//         messageHistory.map((m, i) => 
//           `[${i+1}] ${m.role.toUpperCase()}: ${m.content}`
//         ).join('\n\n')
//       }
//     ];

//     const generateArgs: GenerateArgs = {
//       messages,
//       temperature: 0.1,
//       max_new_tokens: maxTokens ?? 1024
//     };
    
//     if (model) {
//       generateArgs['model'] = model;
//     }

//     let response = '';
//     for await (const chunk of this.session.createResponse(generateArgs, 'reasoning')) {
//       if (!chunk.isLast) {
//         response += chunk.token;
//       }
//     }
    
//     const { cleanContent } = this.contentProcessor.removeThinkTags(response);
//     return cleanContent;
//   }

//     /**
//    * Updates the system message with current context and toolResults
//    */
//     updateContext(agentMemory: AgentMemory): void {
//       // Find and update the system message (should be first message)
//       const systemMessageIndex = agentMemory.messages.findIndex(msg => msg.role === 'system');
      
//       if (systemMessageIndex >= 0 && agentMemory.messages[systemMessageIndex]) {
//         // Get base system prompt (everything before context/tool results sections)
//         const currentSystem = agentMemory.messages[systemMessageIndex].content;
//         const basePrompt = currentSystem.split('\n\n## Current Context:')[0] || '';
        
//         // Rebuild system message with updated context/toolResults
//         agentMemory.messages[systemMessageIndex] = this.buildSystemMessage(basePrompt, agentMemory);
        
//         logger.agent.debug('Updated system message with current context and toolResults', {
//           contextKeys: Object.keys(agentMemory.context || {}),
//           toolResultsCount: Object.keys(agentMemory.toolResults || {}).length
//         });
//       }
//     }
  
//     /**
//      * Builds a system message that includes context and toolResults
//      */
//     private buildSystemMessage(basePrompt: string, memory: AgentMemory): { role: 'system'; content: string } {
//       let systemContent = basePrompt;
      
//       // Add context section
//       if (memory.context && Object.keys(memory.context).length > 0) {
//         systemContent += '\n\n## Current Context:\n';
//         systemContent += Object.entries(memory.context)
//           .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
//           .join('\n');
//       }
      
//       // Add tool results section  
//       if (memory.toolResults && Object.keys(memory.toolResults).length > 0) {
//         systemContent += '\n\n## Previous Tool Results:\n';
//         systemContent += Object.entries(memory.toolResults)
//           .map(([stepId, result]) => {
//             const toolResult = result as any;
//             const resultStr = JSON.stringify(toolResult.result);
//             const truncatedResult = resultStr.length > 200 ? resultStr.substring(0, 200) + '...' : resultStr;
//             return `- ${stepId}: ${toolResult.tool}(${JSON.stringify(toolResult.args)}) → ${truncatedResult}`;
//           })
//           .join('\n');
//       }
  
//       return {
//         role: 'system' as const,
//         content: systemContent
//       };
//     }
// }
