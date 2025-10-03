import type { MemoryFormatter, MemoryMessage, ToolResult } from '../../types/memory';
import type { Message } from '../../types/worker';

export interface FormatterConfig {
  stepInstructionTemplate?: string;
  toolResultsTemplate?: string;
  systemPromptTemplate?: string;
  includeMetadata?: boolean;
}

/**
 * Default memory formatter that converts memory messages to LLM-ready format.
 * Provides customizable templates for formatting different message types.
 */
export class DefaultMemoryFormatter implements MemoryFormatter {
  private config: FormatterConfig;
  
  constructor(config: FormatterConfig = {}) {
    this.config = {
      stepInstructionTemplate: config.stepInstructionTemplate || 
        '**Step:** {stepId}: {prompt}',
      toolResultsTemplate: config.toolResultsTemplate || 
        '**Tool Results:**\n{results}',
      systemPromptTemplate: config.systemPromptTemplate || 
        '{basePrompt}{context}',
      includeMetadata: config.includeMetadata ?? false,
      ...config
    };
  }
  
  formatMessages(messages: MemoryMessage[]): Message[] {
    return messages.map(m => {
      const message: Message = {
        role: m.role,
        content: m.content
      };
      
      // Optionally include metadata in content
      if (this.config.includeMetadata && m.metadata?.type) {
        message.content = `[${m.metadata.type}] ${m.content}`;
      }
      
      return message;
    });
  }
  
  formatToolResults(results: Record<string, ToolResult>): string {
    if (Object.values(results).length === 0) {
      return '';
    }
    
    const formattedResults = Object.values(results)
      .map(tr => `${tr.name}: ${tr.description}\n${tr.result}`)
      .join('\n');
    
    return this.config.toolResultsTemplate!
      .replace('{results}', formattedResults);
  }
  
  formatStepInstruction(stepId: string, prompt: string): string {
    return this.config.stepInstructionTemplate!
      .replace('{stepId}', stepId)
      .replace('{prompt}', prompt);
  }
  
  formatSystemPrompt(basePrompt: string, context?: string): string {
    return this.config.systemPromptTemplate!
      .replace('{basePrompt}', basePrompt)
      .replace('{context}', context || '');
  }
}

