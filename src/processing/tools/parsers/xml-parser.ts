import { logger } from '../../../utils/logger';
import { type ParsedToolCall } from '../parser';

export class XMLToolCallParser {
  parse(content: string): ParsedToolCall | null {
    // Look for tool calls in XML format: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
    // Also handle cases where the closing tag might be missing
    const xmlToolCallRegex = /<tool_call>\s*({.*})\s*(?:<\/tool_call>|$)/s;
    const xmlMatch = content.match(xmlToolCallRegex);
    
    if (!xmlMatch || !xmlMatch[1]) {
      return null;
    }

    logger.agent.debug('Found XML tool call match', { rawMatch: xmlMatch[1] });
    
    try {
      // Handle cases where the JSON might be escaped (from a JSON string)
      let jsonString = xmlMatch[1];
      
      // If it looks like escaped JSON, try to unescape it
      if (jsonString.includes('\\"')) {
        try {
          jsonString = JSON.parse(`"${jsonString}"`);
          logger.agent.debug('Unescaped JSON string', { unescaped: jsonString });
        } catch {
          // If unescaping fails, use the original
          logger.agent.debug('Failed to unescape, using original');
        }
      }
      
      const toolCallData = JSON.parse(jsonString);
      logger.agent.debug('Parsed tool call data', { toolCallData });
      
      if (toolCallData.name) {
        const result = {
          name: toolCallData.name,
          args: toolCallData.arguments || toolCallData.args || {}
        };
        logger.agent.debug('Returning parsed tool call', { result });
        return result;
      }
    } catch (error) {
      logger.agent.warn('Failed to parse XML tool call JSON', { 
        content: xmlMatch[1], 
        error: error instanceof Error ? error.message : String(error) 
      });
    }

    return null;
  }
}
