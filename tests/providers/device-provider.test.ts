import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeviceProvider } from '../../src/providers/device';
import { DeviceProviderConfig, ProviderConfigurationError } from '../../src/types/provider';
import { EventEmitter } from '../../src/utils/event-emitter';

describe('DeviceProvider', () => {
  let eventEmitter: EventEmitter;

  beforeEach(() => {
    eventEmitter = new EventEmitter();
  });

  describe('constructor', () => {
    it('should accept supported model configuration', () => {
      const config: DeviceProviderConfig = {
        runtime: 'transformers-js',
        model: 'onnx-community/Qwen3-0.6B-ONNX',
        quantization: 'q4',
        engine: 'webgpu',
      };

      expect(() => new DeviceProvider(config, eventEmitter)).not.toThrow();
    });

    it('should throw ProviderConfigurationError for unsupported models', () => {
      const config: DeviceProviderConfig = {
        runtime: 'transformers-js',
        model: 'unsupported-model',
        quantization: 'q4',
        engine: 'webgpu',
      };

      expect(() => new DeviceProvider(config, eventEmitter)).toThrow(ProviderConfigurationError);
      expect(() => new DeviceProvider(config, eventEmitter)).toThrow(
        'Model "unsupported-model" is not supported for Transformers.js runtime'
      );
    });

    it('should include list of supported models in error message', () => {
      const config: DeviceProviderConfig = {
        runtime: 'transformers-js',
        model: 'gpt-4',
        quantization: 'q4',
        engine: 'webgpu',
      };

      try {
        new DeviceProvider(config, eventEmitter);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Supported models:');
        expect(error.message).toContain('onnx-community/Qwen3-0.6B-ONNX');
      }
    });
  });

  describe('getModelName', () => {
    it('should return the configured model name', () => {
      const config: DeviceProviderConfig = {
        runtime: 'transformers-js',
        model: 'onnx-community/Qwen3-0.6B-ONNX',
        quantization: 'q4',
        engine: 'webgpu',
      };

      const provider = new DeviceProvider(config, eventEmitter);
      expect(provider.getModelName()).toBe('onnx-community/Qwen3-0.6B-ONNX');
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      const config: DeviceProviderConfig = {
        runtime: 'transformers-js',
        model: 'onnx-community/Qwen3-0.6B-ONNX',
        quantization: 'q4',
        engine: 'webgpu',
      };

      const provider = new DeviceProvider(config, eventEmitter);
      expect(provider.isInitialized()).toBe(false);
    });
  });
});

