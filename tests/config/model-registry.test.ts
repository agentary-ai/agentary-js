import { describe, it, expect } from 'vitest';
import {
  isSupportedModel,
  getModelConfig,
  getSupportedModelIds,
  getMessageTransformer,
  SUPPORTED_MODELS,
  qwenMessageTransformer,
} from '../../src/config/model-registry';
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
      expect(config.supportsToolCalling).toBe(true);
      expect(config.supportsThinking).toBe(true);
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
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const result = qwenMessageTransformer(messages);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
    });

    it('should transform messages with text content blocks', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'What is the weather?' }],
        },
      ];

      const result = qwenMessageTransformer(messages);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ role: 'user', content: 'What is the weather?' });
    });

    it('should transform messages with tool_use content', () => {
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

      const result = qwenMessageTransformer(messages);
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

      const result = qwenMessageTransformer(messages);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'tool',
        content: 'Sunny, 72°F',
      });
    });

    it('should handle mixed content types', () => {
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

      const result = qwenMessageTransformer(messages);
      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ role: 'user', content: 'Check the weather' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Let me check that for you.' });
      expect(result[2].role).toBe('assistant');
      expect((result[2] as any).tool_calls).toBeDefined();
      expect(result[3]).toEqual({ role: 'tool', content: 'Sunny, 72°F' });
    });

    it('should throw error for unsupported content types', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ type: 'unsupported' } as any],
        },
      ];

      expect(() => qwenMessageTransformer(messages)).toThrow('Unsupported content type: unsupported');
    });
  });

  describe('SUPPORTED_MODELS', () => {
    it('should export supported models object', () => {
      expect(SUPPORTED_MODELS).toBeDefined();
      expect(typeof SUPPORTED_MODELS).toBe('object');
      expect(SUPPORTED_MODELS['onnx-community/Qwen3-0.6B-ONNX']).toBeDefined();
    });
  });
});

