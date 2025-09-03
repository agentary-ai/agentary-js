import { type ParsedToolCall } from '../parser';

export class FunctionCallParser {
  parse(content: string): ParsedToolCall | null {
    // Look for simple function call patterns in the generated text
    const functionCallRegex = /(\w+)\((.*?)\)/;
    const functionMatch = content.match(functionCallRegex);
    
    if (!functionMatch || !functionMatch[1]) {
      return null;
    }

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
}
