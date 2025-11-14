import { logger } from '../../../utils/logger';
import { type ParsedToolCall } from '../parser';

export class JSONToolCallParser {
  parse(content: string): ParsedToolCall | null {
    // Try to match the tool call structure first
    const toolCallPattern = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"(?:arguments|args)"\s*:\s*/;
    const match = content.match(toolCallPattern);
    
    if (!match || match.index === undefined || !match[1]) {
      return null;
    }
    
    const name = match[1];
    const argsStartIndex = match.index + match[0].length;
    
    // Use a bracket-counting approach to extract the full arguments object
    let bracketCount = 0;
    let argsEndIndex = argsStartIndex;
    let started = false;
    
    for (let i = argsStartIndex; i < content.length; i++) {
      const char = content[i];
      if (char === '{') {
        bracketCount++;
        started = true;
      } else if (char === '}') {
        bracketCount--;
        if (started && bracketCount === 0) {
          argsEndIndex = i + 1;
          break;
        }
      }
    }
    
    if (bracketCount !== 0) {
      logger.agent.warn('Unbalanced brackets in JSON tool call arguments');
      return null;
    }
    
    const argsString = content.substring(argsStartIndex, argsEndIndex);
    
    try {
      const args = JSON.parse(argsString);
      return { name, args };
    } catch (error) {
      logger.agent.warn('Failed to parse JSON tool call arguments', { 
        args: argsString, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null;
    }
  }
}
