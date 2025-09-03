import { logger } from '../../../utils/logger';
import { type ParsedToolCall } from '../parser';

export class JSONToolCallParser {
  parse(content: string): ParsedToolCall | null {
    // Look for JSON tool call patterns without XML tags
    const jsonToolCallRegex = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"(?:arguments|args)"\s*:\s*(\{[^}]*\})\s*\}/;
    const jsonMatch = content.match(jsonToolCallRegex);
    
    if (!jsonMatch || !jsonMatch[1]) {
      return null;
    }

    logger.agent.debug('Found JSON tool call match', { match: jsonMatch[0] });
    
    try {
      const args = JSON.parse(jsonMatch[2] || '{}');
      const result = {
        name: jsonMatch[1],
        args
      };
      logger.agent.debug('Returning JSON parsed tool call', { result });
      return result;
    } catch (error) {
      logger.agent.warn('Failed to parse JSON tool call arguments', { 
        args: jsonMatch[2], 
        error: error instanceof Error ? error.message : String(error) 
      });
    }

    return null;
  }
}
