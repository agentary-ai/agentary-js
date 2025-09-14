import { CompositeToolCallParser, type ToolCallParser } from './parsers/composite-parser';

export interface ParsedToolCall {
  name: string;
  args: Record<string, any>;
}

export class ToolParser {
  private parser: ToolCallParser;

  constructor() {
    this.parser = new CompositeToolCallParser();
  }

  parse(content: string): ParsedToolCall | null {
    return this.parser.parse(content);
  }
}

