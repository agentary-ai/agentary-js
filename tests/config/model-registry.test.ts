import { describe, it, expect } from 'vitest';
import {
  isSupportedModel,
  getModelConfig,
  getSupportedModelIds,
  getMessageTransformer,
  SUPPORTED_MODELS,
} from '../../src/providers/device-model-config';
import { Message } from '../../src/types/worker';

describe('Model Registry', () => {
  describe('isSupportedModel', () => {
    it('should return true for supported models', () => {
      expect(isSupportedModel('onnx-community/Qwen3-0.6B-ONNX')).toBe(true);
    });

    it('should return false for unsupported models', () => {
      expect(isSupportedModel('unsupported-model')).toBe(false);
      expect(isSupportedModel('gpt-4')).toBe(false);
    });
  });

  describe('getModelConfig', () => {
    it('should return config for supported models', () => {
      const config = getModelConfig('onnx-community/Qwen3-0.6B-ONNX');
      expect(config).toBeDefined();
      expect(config.modelId).toBe('onnx-community/Qwen3-0.6B-ONNX');
      expect(config.displayName).toBe('Qwen3 0.6B (ONNX)');
      expect(config.toolSupport).toBe(true);
      expect(config.reasoningSupport).toBe(true);
      expect(config.messageTransformer).toBeDefined();
    });

    it('should throw error for unsupported models', () => {
      expect(() => getModelConfig('unsupported-model')).toThrow(
        'Model "unsupported-model" is not supported for device inference'
      );
    });
  });

  describe('getSupportedModelIds', () => {
    it('should return array of supported model IDs', () => {
      const modelIds = getSupportedModelIds();
      expect(Array.isArray(modelIds)).toBe(true);
      expect(modelIds).toContain('onnx-community/Qwen3-0.6B-ONNX');
      expect(modelIds.length).toBeGreaterThan(0);
    });
  });

  describe('getMessageTransformer', () => {
    it('should return transformer for supported models', () => {
      const transformer = getMessageTransformer('onnx-community/Qwen3-0.6B-ONNX');
      expect(transformer).toBeDefined();
      expect(typeof transformer).toBe('function');
    });

    it('should throw error for unsupported models', () => {
      expect(() => getMessageTransformer('unsupported-model')).toThrow();
    });
  });

  describe('qwenMessageTransformer', () => {
    it('should transform simple text messages', () => {
      const config = getModelConfig('onnx-community/Qwen3-0.6B-ONNX');
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const result = config.messageTransformer(messages);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
    });

    it('should transform messages with text content blocks', () => {
      const config = getModelConfig('onnx-community/Qwen3-0.6B-ONNX');
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'What is the weather?' }],
        },
      ];

      const result = config.messageTransformer(messages);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ role: 'user', content: 'What is the weather?' });
    });

    it('should transform messages with tool_use content', () => {
      const config = getModelConfig('onnx-community/Qwen3-0.6B-ONNX');
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'get_weather',
              arguments: { location: 'New York' },
            },
          ],
        },
      ];

      const result = config.messageTransformer(messages);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: { location: 'New York' },
            },
          },
        ],
      });
    });

    it('should transform messages with tool_result content', () => {
      const config = getModelConfig('onnx-community/Qwen3-0.6B-ONNX');
      const messages: Message[] = [
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
      ];

      const result = config.messageTransformer(messages);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'tool',
        content: 'Sunny, 72°F',
      });
    });

    it('should handle mixed content types', () => {
      const config = getModelConfig('onnx-community/Qwen3-0.6B-ONNX');
      const messages: Message[] = [
        { role: 'user', content: 'Check the weather' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me check that for you.' },
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'get_weather',
              arguments: { location: 'New York' },
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
      ];

      const result = config.messageTransformer(messages);
      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ role: 'user', content: 'Check the weather' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Let me check that for you.' });
      expect(result[2].role).toBe('assistant');
      expect((result[2] as any).tool_calls).toBeDefined();
      expect(result[3]).toEqual({ role: 'tool', content: 'Sunny, 72°F' });
    });

    it('should throw error for unsupported content types', () => {
      const config = getModelConfig('onnx-community/Qwen3-0.6B-ONNX');
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ type: 'unsupported' } as any],
        },
      ];

      expect(() => config.messageTransformer(messages)).toThrow('Unsupported content type: unsupported');
    });
  });

  describe('SUPPORTED_MODELS', () => {
    it('should export supported models object', () => {
      expect(SUPPORTED_MODELS).toBeDefined();
      expect(typeof SUPPORTED_MODELS).toBe('object');
      expect(SUPPORTED_MODELS['onnx-community/Qwen3-0.6B-ONNX']).toBeDefined();
    });
  });

  describe('qwenResponseParser', () => {
    it('should extract reasoning from <think> tags', () => {
      const config = getModelConfig('onnx-community/Qwen3-0.6B-ONNX');
      const content = '<think>Let me analyze this problem first</think>Here is the answer';
      
      const result = config.responseParser!(content);
      
      expect(result.reasoning).toBe('Let me analyze this problem first');
      expect(result.content).toBe('Here is the answer');
    });

    it('should extract tool calls from <tool_call> tags', () => {
      const config = getModelConfig('onnx-community/Qwen3-0.6B-ONNX');
      const content = 'Let me search for that.\n<tool_call>\n{"name": "search", "arguments": {"query": "test"}}\n</tool_call>';
      
      const result = config.responseParser!(content);
      
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('search');
      expect(result.finishReason).toBe('tool_calls');
      expect(result.content).toBe('Let me search for that.');
    });

    it('should extract both reasoning and tool calls', () => {
      const config = getModelConfig('onnx-community/Qwen3-0.6B-ONNX');
      const content = '<think>I need to search for this information</think>Let me help you.\n<tool_call>\n{"name": "search", "arguments": {"query": "test"}}\n</tool_call>';
      
      const result = config.responseParser!(content);
      
      expect(result.reasoning).toBe('I need to search for this information');
      expect(result.content).toBe('Let me help you.');
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(1);
    });

    it('should handle content without reasoning or tool calls', () => {
      const config = getModelConfig('onnx-community/Qwen3-0.6B-ONNX');
      const content = 'Just a simple response';
      
      const result = config.responseParser!(content);
      
      expect(result.content).toBe('Just a simple response');
      expect(result.reasoning).toBeUndefined();
      expect(result.toolCalls).toBeUndefined();
      expect(result.finishReason).toBeUndefined();
    });

    it('should handle multiline reasoning', () => {
      const config = getModelConfig('onnx-community/Qwen3-0.6B-ONNX');
      const content = '<think>First, let me think about this.\nThen I need to consider multiple factors.\nFinally, I can provide an answer.</think>Here is my response.';
      
      const result = config.responseParser!(content);
      
      expect(result.reasoning).toBe('First, let me think about this.\nThen I need to consider multiple factors.\nFinally, I can provide an answer.');
      expect(result.content).toBe('Here is my response.');
    });

    it('should handle invalid JSON in tool calls gracefully', () => {
      const config = getModelConfig('onnx-community/Qwen3-0.6B-ONNX');
      const content = 'Response with invalid tool call\n<tool_call>\n{invalid json}\n</tool_call>';
      
      const result = config.responseParser!(content);
      
      expect(result.toolCalls || []).toHaveLength(0);
      // Invalid JSON should remain in content
      expect(result.content).toContain('{invalid json}');
    });
  });
});

