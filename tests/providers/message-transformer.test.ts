import { describe, it, expect } from 'vitest';
import {
  transformArgs,
  transformResponse,
  transformMessagesToProvider,
} from '../../src/providers/transformation';
import type { GenerateArgs, Message } from '../../src/types/worker';

describe('Message Transformer', () => {
  describe('transformArgs', () => {
    describe('Anthropic provider', () => {
      it('should not transform messages for Anthropic provider', () => {
        const args: GenerateArgs = {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'tool_use',
                  id: 'tool_123',
                  name: 'get_weather',
                  arguments: { city: 'San Francisco' },
                },
              ],
            },
          ],
        };

        const result = transformArgs(args, 'anthropic');
        expect(result).toEqual(args);
        expect(result.messages).toEqual(args.messages);
      });
    });

    describe('OpenAI provider - Simple messages', () => {
      it('should transform string content to input message', () => {
        const args: GenerateArgs = {
          messages: [
            {
              role: 'user',
              content: 'Hello, world!',
            },
          ],
        };

        const result = transformArgs(args, 'openai');
        
        expect(result.input).toBeDefined();
        expect(result.input).toHaveLength(1);
        expect(result.input[0]).toEqual({
          type: 'message',
          role: 'user',
          content: 'Hello, world!',
        });
        expect(result.messages).toBeUndefined();
      });

      it('should transform assistant role to developer role', () => {
        const args: GenerateArgs = {
          messages: [
            {
              role: 'assistant',
              content: 'I can help you.',
            },
          ],
        };

        const result = transformArgs(args, 'openai');
        
        expect(result.input[0]).toEqual({
          type: 'message',
          role: 'developer',
          content: 'I can help you.',
        });
      });

      it('should transform text content to input_text', () => {
        const args: GenerateArgs = {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'What is the weather?',
                },
              ],
            },
          ],
        };

        const result = transformArgs(args, 'openai');
        
        expect(result.input[0]).toEqual({
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'What is the weather?',
            },
          ],
        });
      });
    });

    describe('OpenAI provider - Tool calls', () => {
      it('should transform tool_use to function_call as separate input item', () => {
        const args: GenerateArgs = {
          messages: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  id: 'tool_123',
                  name: 'get_weather',
                  arguments: { city: 'San Francisco' },
                },
              ],
            },
          ],
        };

        const result = transformArgs(args, 'openai');
        
        expect(result.input).toHaveLength(1);
        expect(result.input[0]).toEqual({
          type: 'function_call',
          call_id: 'tool_123',
          name: 'get_weather',
          arguments: JSON.stringify({ city: 'San Francisco' }),
        });
      });

      it('should transform tool_result to function_call_output', () => {
        const args: GenerateArgs = {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tool_123',
                  result: 'Sunny, 72°F',
                },
              ],
            },
          ],
        };

        const result = transformArgs(args, 'openai');
        
        expect(result.input).toHaveLength(1);
        expect(result.input[0]).toEqual({
          type: 'function_call_output',
          call_id: 'tool_123',
          output: 'Sunny, 72°F',
        });
      });

      it('should transform tools array to include type field', () => {
        const args: GenerateArgs = {
          messages: [{ role: 'user', content: 'test' }],
          tools: [
            {
              name: 'get_weather',
              description: 'Get weather info',
              parameters: { type: 'object', properties: {} },
            },
          ],
        };

        const result = transformArgs(args, 'openai');
        
        expect(result.tools).toBeDefined();
        expect(result.tools[0]).toEqual({
          type: 'function',
          name: 'get_weather',
          description: 'Get weather info',
          parameters: { type: 'object', properties: {} },
        });
      });

      it('should transform max_new_tokens to max_output_tokens', () => {
        const args: GenerateArgs = {
          messages: [{ role: 'user', content: 'test' }],
          max_new_tokens: 100,
        };

        const result = transformArgs(args, 'openai');
        
        expect(result.max_output_tokens).toBe(100);
        expect(result.max_new_tokens).toBeUndefined();
      });
    });

    describe('OpenAI provider - Mixed content', () => {
      it('should handle mixed content with text and tool_use', () => {
        const args: GenerateArgs = {
          messages: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'Let me check the weather.',
                },
                {
                  type: 'tool_use',
                  id: 'tool_123',
                  name: 'get_weather',
                  arguments: { city: 'New York' },
                },
              ],
            },
          ],
        };

        const result = transformArgs(args, 'openai');
        
        // Text content becomes a message, tool_use becomes separate function_call
        expect(result.input).toHaveLength(2);
        expect(result.input[0]).toEqual({
          type: 'message',
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text: 'Let me check the weather.',
            },
          ],
        });
        expect(result.input[1]).toEqual({
          type: 'function_call',
          call_id: 'tool_123',
          name: 'get_weather',
          arguments: JSON.stringify({ city: 'New York' }),
        });
      });

      it('should handle multiple tool calls in sequence', () => {
        const args: GenerateArgs = {
          messages: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  id: 'tool_001',
                  name: 'first_tool',
                  arguments: { a: 1 },
                },
                {
                  type: 'tool_use',
                  id: 'tool_002',
                  name: 'second_tool',
                  arguments: { b: 2 },
                },
              ],
            },
          ],
        };

        const result = transformArgs(args, 'openai');
        
        expect(result.input).toHaveLength(2);
        expect(result.input[0].type).toBe('function_call');
        expect(result.input[0].call_id).toBe('tool_001');
        expect(result.input[1].type).toBe('function_call');
        expect(result.input[1].call_id).toBe('tool_002');
      });
    });

    describe('OpenAI provider - Complex scenarios', () => {
      it('should handle multi-turn conversation with tools', () => {
        const args: GenerateArgs = {
          messages: [
            {
              role: 'user',
              content: 'What is the weather in SF?',
            },
            {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'Let me check that for you.',
                },
                {
                  type: 'tool_use',
                  id: 'tool_123',
                  name: 'get_weather',
                  arguments: { city: 'San Francisco' },
                },
              ],
            },
            {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tool_123',
                  result: 'Sunny, 72°F',
                },
              ],
            },
          ],
        };

        const result = transformArgs(args, 'openai');
        
        expect(result.input).toHaveLength(4);
        expect(result.input[0].type).toBe('message');
        expect(result.input[1].type).toBe('message');
        expect(result.input[2].type).toBe('function_call');
        expect(result.input[3].type).toBe('function_call_output');
      });

      it('should preserve other GenerateArgs properties', () => {
        const args: GenerateArgs = {
          messages: [{ role: 'user', content: 'test' }],
          temperature: 0.7,
          top_p: 0.9,
          stop: ['END'],
        };

        const result = transformArgs(args, 'openai');
        
        expect(result.temperature).toBe(0.7);
        expect(result.top_p).toBe(0.9);
        expect(result.stop).toEqual(['END']);
      });
    });
  });

  describe('transformResponse', () => {
    describe('Anthropic provider', () => {
      it('should return empty array for Anthropic provider', () => {
        const response = {
          content: [{ type: 'text', text: 'Hello' }],
        };

        const result = transformResponse(response, 'anthropic');
        expect(result).toEqual([]);
      });
    });

    describe('OpenAI provider', () => {
      it('should transform output message to assistant message', () => {
        const response = {
          output: [
            {
              id: 'msg_001',
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'Hello!',
                },
              ],
              status: 'completed',
            },
          ],
        };

        const result = transformResponse(response, 'openai');
        
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          role: 'assistant',
          content: 'Hello!',
        });
      });

      it('should transform multiple output_text items to content array', () => {
        const response = {
          output: [
            {
              id: 'msg_001',
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'First part.',
                },
                {
                  type: 'output_text',
                  text: 'Second part.',
                },
              ],
              status: 'completed',
            },
          ],
        };

        const result = transformResponse(response, 'openai');
        
        expect(result[0].content).toEqual([
          { type: 'text', text: 'First part.' },
          { type: 'text', text: 'Second part.' },
        ]);
      });

      it('should transform function_call to tool_use', () => {
        const response = {
          output: [
            {
              type: 'function_call',
              id: 'fc_001',
              call_id: 'call_abc123',
              name: 'get_weather',
              arguments: JSON.stringify({ city: 'Chicago' }),
            },
          ],
        };

        const result = transformResponse(response, 'openai');
        
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'call_abc123',
              name: 'get_weather',
              arguments: { city: 'Chicago' },
            },
          ],
        });
      });

      it('should handle mixed output with message and function calls', () => {
        const response = {
          output: [
            {
              id: 'msg_001',
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'Let me check that.',
                },
              ],
              status: 'completed',
            },
            {
              type: 'function_call',
              id: 'fc_001',
              call_id: 'call_123',
              name: 'search',
              arguments: JSON.stringify({ query: 'AI' }),
            },
          ],
        };

        const result = transformResponse(response, 'openai');
        
        expect(result).toHaveLength(2);
        expect(result[0].content).toBe('Let me check that.');
        expect(result[1].content[0]).toEqual({
          type: 'tool_use',
          id: 'call_123',
          name: 'search',
          arguments: { query: 'AI' },
        });
      });

      it('should return empty array for missing output', () => {
        const response = {};
        const result = transformResponse(response, 'openai');
        expect(result).toEqual([]);
      });

      it('should return empty array for non-array output', () => {
        const response = { output: 'invalid' };
        const result = transformResponse(response, 'openai');
        expect(result).toEqual([]);
      });
    });
  });

  describe('transformMessagesToProvider (backward compatibility)', () => {
    it('should return messages unchanged for Anthropic provider', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'get_weather',
              arguments: { city: 'San Francisco' },
            },
          ],
        },
      ];

      const result = transformMessagesToProvider(messages, 'anthropic');
      expect(result).toEqual(messages);
    });

    it('should return input items for OpenAI provider', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'get_weather',
              arguments: { city: 'San Francisco' },
            },
          ],
        },
      ];

      const result = transformMessagesToProvider(messages, 'openai');
      
      // Returns the input array from transformed args
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].type).toBe('function_call');
      expect(result[0].call_id).toBe('tool_123');
    });

    it('should handle string content for OpenAI provider', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Hello, world!',
        },
      ];

      const result = transformMessagesToProvider(messages, 'openai');
      
      expect(result[0]).toEqual({
        type: 'message',
        role: 'user',
        content: 'Hello, world!',
      });
    });
  });

  describe('Bidirectional Transformation', () => {
    it('should maintain data integrity through round-trip transformation', () => {
      const originalArgs: GenerateArgs = {
        messages: [
          {
            role: 'user',
            content: 'What is the weather?',
          },
        ],
      };

      // Transform to OpenAI
      const toOpenAI = transformArgs(originalArgs, 'openai');
      expect(toOpenAI.input).toBeDefined();

      // Simulate response
      const mockResponse = {
        output: [
          {
            id: 'msg_001',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'The weather is sunny.',
              },
            ],
            status: 'completed',
          },
        ],
      };

      // Transform back
      const messages = transformResponse(mockResponse, 'openai');
      
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].content).toBe('The weather is sunny.');
    });

    it('should handle tool calling round-trip', () => {
      const originalArgs: GenerateArgs = {
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tool_001',
                name: 'get_data',
                arguments: { id: 123 },
              },
            ],
          },
        ],
      };

      // Transform to OpenAI
      const toOpenAI = transformArgs(originalArgs, 'openai');
      expect(toOpenAI.input[0].type).toBe('function_call');

      // Simulate response with function call
      const mockResponse = {
        output: [
          {
            type: 'function_call',
            id: 'fc_001',
            call_id: 'tool_001',
            name: 'get_data',
            arguments: JSON.stringify({ id: 123 }),
          },
        ],
      };

      // Transform back
      const messages = transformResponse(mockResponse, 'openai');
      
      expect(messages[0].content[0]).toEqual({
        type: 'tool_use',
        id: 'tool_001',
        name: 'get_data',
        arguments: { id: 123 },
      });
    });

    it('should preserve tool definitions through transformation', () => {
      const originalArgs: GenerateArgs = {
        messages: [{ role: 'user', content: 'test' }],
        tools: [
          {
            name: 'search',
            description: 'Search the web',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
              required: ['query'],
            },
          },
        ],
      };

      const toOpenAI = transformArgs(originalArgs, 'openai');
      
      expect(toOpenAI.tools[0]).toMatchObject({
        type: 'function',
        name: 'search',
        description: 'Search the web',
        parameters: originalArgs.tools[0].parameters,
      });
    });
  });
});
