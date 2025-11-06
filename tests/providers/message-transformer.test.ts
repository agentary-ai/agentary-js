import { describe, it, expect } from 'vitest';
import {
  transformMessagesToProvider,
  transformMessagesFromProvider,
  transformContentToOpenAI,
  transformContentFromOpenAI,
} from '../../src/providers/message-transformer';
import type { Message, ToolUseContent, ToolResultContent, TextContent } from '../../src/types/worker';

describe('Message Transformer', () => {
  describe('transformMessagesToProvider', () => {
    it('should not transform messages for Anthropic provider', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'get_weather',
              arguments: { city: 'San Francisco' },
            } as ToolUseContent,
          ],
        },
      ];

      const result = transformMessagesToProvider(messages, 'anthropic');
      expect(result).toEqual(messages);
    });

    it('should transform tool_use to function_call for OpenAI provider', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'get_weather',
              arguments: { city: 'San Francisco' },
            } as ToolUseContent,
          ],
        },
      ];

      const result = transformMessagesToProvider(messages, 'openai');
      
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('assistant');
      expect(Array.isArray(result[0].content)).toBe(true);
      
      const content = result[0].content as any[];
      expect(content[0]).toEqual({
        type: 'function_call',
        call_id: 'tool_123',
        name: 'get_weather',
        arguments: { city: 'San Francisco' },
      });
    });

    it('should transform tool_result to tool type for OpenAI provider', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_123',
              result: 'Sunny, 72°F',
            } as ToolResultContent,
          ],
        },
      ];

      const result = transformMessagesToProvider(messages, 'openai');
      
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
      
      const content = result[0].content as any[];
      expect(content[0]).toEqual({
        type: 'tool',
        tool_call_id: 'tool_123',
        content: 'Sunny, 72°F',
      });
    });

    it('should preserve text content for OpenAI provider', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What is the weather?',
            } as TextContent,
          ],
        },
      ];

      const result = transformMessagesToProvider(messages, 'openai');
      
      expect(result).toHaveLength(1);
      const content = result[0].content as any[];
      expect(content[0]).toEqual({
        type: 'text',
        text: 'What is the weather?',
      });
    });

    it('should handle string content without transformation', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Hello, world!',
        },
      ];

      const result = transformMessagesToProvider(messages, 'openai');
      expect(result).toEqual(messages);
    });

    it('should handle mixed content arrays for OpenAI provider', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Let me check the weather.',
            } as TextContent,
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'get_weather',
              arguments: { city: 'New York' },
            } as ToolUseContent,
          ],
        },
      ];

      const result = transformMessagesToProvider(messages, 'openai');
      
      const content = result[0].content as any[];
      expect(content).toHaveLength(2);
      expect(content[0].type).toBe('text');
      expect(content[1].type).toBe('function_call');
      expect(content[1].call_id).toBe('tool_123');
    });
  });

  describe('transformMessagesFromProvider', () => {
    it('should not transform messages from Anthropic provider', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'get_weather',
              arguments: { city: 'Boston' },
            } as ToolUseContent,
          ],
        },
      ];

      const result = transformMessagesFromProvider(messages, 'anthropic');
      expect(result).toEqual(messages);
    });

    it('should transform function_call to tool_use from OpenAI provider', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'function_call' as any,
              call_id: 'call_abc123',
              name: 'get_weather',
              arguments: { city: 'Chicago' },
            },
          ] as any,
        },
      ];

      const result = transformMessagesFromProvider(messages, 'openai');
      
      const content = result[0].content as any[];
      expect(content[0]).toEqual({
        type: 'tool_use',
        id: 'call_abc123',
        name: 'get_weather',
        arguments: { city: 'Chicago' },
      });
    });

    it('should transform tool type to tool_result from OpenAI provider', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool' as any,
              tool_call_id: 'call_abc123',
              content: 'Rainy, 55°F',
            },
          ] as any,
        },
      ];

      const result = transformMessagesFromProvider(messages, 'openai');
      
      const content = result[0].content as any[];
      expect(content[0]).toEqual({
        type: 'tool_result',
        tool_use_id: 'call_abc123',
        result: 'Rainy, 55°F',
      });
    });

    it('should handle string content without transformation', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Hello from OpenAI!',
        },
      ];

      const result = transformMessagesFromProvider(messages, 'openai');
      expect(result).toEqual(messages);
    });
  });

  describe('transformContentToOpenAI', () => {
    it('should transform tool_use to function_call', () => {
      const content: ToolUseContent = {
        type: 'tool_use',
        id: 'tool_456',
        name: 'search',
        arguments: { query: 'AI' },
      };

      const result = transformContentToOpenAI(content);
      
      expect(result).toEqual({
        type: 'function_call',
        call_id: 'tool_456',
        name: 'search',
        arguments: { query: 'AI' },
      });
    });

    it('should transform tool_result to tool type', () => {
      const content: ToolResultContent = {
        type: 'tool_result',
        tool_use_id: 'tool_456',
        result: 'Search results...',
      };

      const result = transformContentToOpenAI(content);
      
      expect(result).toEqual({
        type: 'tool',
        tool_call_id: 'tool_456',
        content: 'Search results...',
      });
    });

    it('should pass through text content unchanged', () => {
      const content: TextContent = {
        type: 'text',
        text: 'Hello',
      };

      const result = transformContentToOpenAI(content);
      expect(result).toEqual(content);
    });

    it('should pass through unknown content types', () => {
      const content = {
        type: 'unknown',
        data: 'something',
      } as any;

      const result = transformContentToOpenAI(content);
      expect(result).toEqual(content);
    });
  });

  describe('transformContentFromOpenAI', () => {
    it('should transform function_call to tool_use', () => {
      const content = {
        type: 'function_call',
        call_id: 'call_789',
        name: 'calculate',
        arguments: { x: 5, y: 10 },
      };

      const result = transformContentFromOpenAI(content as any);
      
      expect(result).toEqual({
        type: 'tool_use',
        id: 'call_789',
        name: 'calculate',
        arguments: { x: 5, y: 10 },
      });
    });

    it('should transform tool type to tool_result', () => {
      const content = {
        type: 'tool',
        tool_call_id: 'call_789',
        content: '15',
      };

      const result = transformContentFromOpenAI(content as any);
      
      expect(result).toEqual({
        type: 'tool_result',
        tool_use_id: 'call_789',
        result: '15',
      });
    });

    it('should pass through text content unchanged', () => {
      const content: TextContent = {
        type: 'text',
        text: 'Hello from OpenAI',
      };

      const result = transformContentFromOpenAI(content as any);
      expect(result).toEqual(content);
    });

    it('should pass through unknown content types', () => {
      const content = {
        type: 'unknown',
        data: 'something else',
      } as any;

      const result = transformContentFromOpenAI(content);
      expect(result).toEqual(content);
    });
  });

  describe('Bidirectional Transformation', () => {
    it('should maintain data integrity through round-trip transformation', () => {
      const originalMessages: Message[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Let me help you.',
            } as TextContent,
            {
              type: 'tool_use',
              id: 'tool_001',
              name: 'get_data',
              arguments: { id: 123 },
            } as ToolUseContent,
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_001',
              result: 'Data retrieved',
            } as ToolResultContent,
          ],
        },
      ];

      // Transform to OpenAI and back
      const toOpenAI = transformMessagesToProvider(originalMessages, 'openai');
      const backToAnthropic = transformMessagesFromProvider(toOpenAI, 'openai');

      expect(backToAnthropic).toEqual(originalMessages);
    });

    it('should handle multiple tool calls in sequence', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool_001',
              name: 'first_tool',
              arguments: { a: 1 },
            } as ToolUseContent,
            {
              type: 'tool_use',
              id: 'tool_002',
              name: 'second_tool',
              arguments: { b: 2 },
            } as ToolUseContent,
          ],
        },
      ];

      const transformed = transformMessagesToProvider(messages, 'openai');
      const content = transformed[0].content as any[];
      
      expect(content).toHaveLength(2);
      expect(content[0].type).toBe('function_call');
      expect(content[0].call_id).toBe('tool_001');
      expect(content[1].type).toBe('function_call');
      expect(content[1].call_id).toBe('tool_002');
    });
  });
});

