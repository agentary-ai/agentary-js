import { logger } from '../../../utils/logger';
import { type ParsedToolCall } from '../parser';
import { XMLToolCallParser } from './xml-parser';
import { JSONToolCallParser } from './json-parser';
import { FunctionCallParser } from './function-parser';

export interface ToolCallParser {
  parse(content: string): ParsedToolCall | null;
}

export class CompositeToolCallParser implements ToolCallParser {
  private parsers: ToolCallParser[];

  constructor() {
    this.parsers = [
      new XMLToolCallParser(),
      new JSONToolCallParser(),
      new FunctionCallParser()
    ];
  }

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

    // Try each parser in order until one succeeds
    for (const parser of this.parsers) {
      const result = parser.parse(actualContent);
      if (result) {
        logger.agent.debug('Tool call parsed successfully', { parser: parser.constructor.name, result });
        return result;
      }
    }

    logger.agent.debug('No tool call pattern found in content');
    return null;
  }
}
