import { logger } from '../utils/logger';

export interface ParsedToolCall {
  name: string;
  args: Record<string, any>;
}

export class ToolCallParser {
  parse(content: string): ParsedToolCall | null {
    logger.agent.debug('Parsing tool call from content', { content });
    
    // First check if the content itself is a JSON string that needs to be parsed
    // Only attempt this if the content looks like JSON (starts with { and ends with })
    let actualContent = content;
    if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
      try {
        // Try to parse as JSON to see if it's a JSON-encoded object
        const possibleJson = JSON.parse(content);
        if (possibleJson && typeof possibleJson === 'object' && possibleJson.cleanContent) {
          actualContent = possibleJson.cleanContent;
          logger.agent.debug('Extracted cleanContent from JSON wrapper', { actualContent });
        }
      } catch {
        // Not valid JSON, use content as-is
        logger.agent.debug('Content looks like JSON but failed to parse, using as-is');
      }
    }
    
    // Look for tool calls in XML format: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
    // Also handle cases where the closing tag might be missing
    const xmlToolCallRegex = /<tool_call>\s*({.*?})\s*(?:<\/tool_call>|$)/s;
    const xmlMatch = actualContent.match(xmlToolCallRegex);
    
    if (xmlMatch && xmlMatch[1]) {
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
    }
    
    // Fallback: Look for simple function call patterns in the generated text
    const functionCallRegex = /(\w+)\((.*?)\)/;
    const functionMatch = content.match(functionCallRegex);
    
    if (functionMatch && functionMatch[1]) {
      try {
        const args = functionMatch[2] ? JSON.parse(`{${functionMatch[2]}}`) : {};
        return {
          name: functionMatch[1],
          args
        };
      } catch {
        // Fallback: try to extract simple key-value pairs
        const simpleArgs: Record<string, any> = {};
        const argPairs = functionMatch[2] ? functionMatch[2].split(',') : [];
        for (const pair of argPairs) {
          const [key, value] = pair.split(':').map(s => s.trim());
          if (key && value) {
            simpleArgs[key.replace(/['"]/g, '')] = value.replace(/['"]/g, '');
          }
        }
        return {
          name: functionMatch[1]!,
          args: simpleArgs
        };
      }
    }
    
    // Additional fallback: Look for JSON tool call patterns without XML tags
    const jsonToolCallRegex = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"(?:arguments|args)"\s*:\s*(\{[^}]*\})\s*\}/;
    const jsonMatch = actualContent.match(jsonToolCallRegex);
    
    if (jsonMatch && jsonMatch[1]) {
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
    }

    logger.agent.debug('No tool call pattern found in content');
    return null;
  }
}

