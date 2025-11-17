import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSession } from '../../src/core/session';
import type { InferenceProviderConfig } from '../../src/types/provider';
import type { GenerateArgs } from '../../src/types/worker';

/**
 * Integration tests for device/cloud provider switching
 * 
 * These tests validate the core multi-provider architecture that allows
 * users to mix on-device and cloud models in the same session.
 */

// Mock fetch for cloud provider
global.fetch = vi.fn();

describe('Provider Switching Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Single Provider Scenarios (Baseline)', () => {
    it('should initialize and generate with device provider only', async () => {
      const session = await createSession({
        models: [
          {
            type: 'device',
            model: 'onnx-community/Qwen3-0.6B-ONNX',
            quantization: 'q4',
            engine: 'webgpu',
          },
        ],
      });

      // Mock worker response
      const mockWorker = (global.Worker as any).mock.results[0].value;
      mockWorker.postMessage = vi.fn((msg) => {
        if (msg.type === 'generate') {
          // Simulate streaming response
          setTimeout(() => {
            mockWorker.onmessage?.({
              data: {
                type: 'chunk',
                requestId: msg.requestId,
                args: { token: 'Hello', tokenId: 1 },
              },
            });
            mockWorker.onmessage?.({
              data: {
                type: 'chunk',
                requestId: msg.requestId,
                args: { token: ' from', tokenId: 2 },
              },
            });
            mockWorker.onmessage?.({
              data: {
                type: 'chunk',
                requestId: msg.requestId,
                args: { token: ' device', tokenId: 3 },
              },
            });
            mockWorker.onmessage?.({
              data: {
                type: 'complete',
                requestId: msg.requestId,
              },
            });
          }, 10);
        } else if (msg.type === 'init') {
          // Simulate initialization
          setTimeout(() => {
            mockWorker.onmessage?.({
              data: {
                type: 'complete',
                requestId: msg.requestId,
              },
            });
          }, 10);
        }
      });

      const response = await session.createResponse('onnx-community/Qwen3-0.6B-ONNX', {
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response.type).toBe('streaming');

      if (response.type === 'streaming') {
        const chunks: any[] = [];
        for await (const chunk of response.stream) {
          chunks.push(chunk);
        }

        expect(chunks.length).toBeGreaterThan(0);
      }

      await session.dispose();
    });

    it('should initialize and generate with cloud provider only', async () => {
      const session = await createSession({
        models: [
          {
            type: 'cloud',
            model: 'claude-sonnet-4',
            proxyUrl: 'https://api.example.com/anthropic',
            modelProvider: 'anthropic',
          },
        ],
      });

      // Mock fetch for cloud provider
      const mockBody = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('data: {"token":"Hello","tokenId":1}\n\n')
          );
          controller.enqueue(
            new TextEncoder().encode('data: {"token":" from","tokenId":2}\n\n')
          );
          controller.enqueue(
            new TextEncoder().encode('data: {"token":" cloud","tokenId":3}\n\n')
          );
          controller.enqueue(
            new TextEncoder().encode('data: {"token":"","tokenId":-1,"isLast":true}\n\n')
          );
          controller.close();
        },
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => (name === 'Content-Type' ? 'text/event-stream' : null),
        },
        body: mockBody,
      });

      const response = await session.createResponse('claude-sonnet-4', {
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(response.type).toBe('streaming');

      if (response.type === 'streaming') {
        const chunks: any[] = [];
        for await (const chunk of response.stream) {
          chunks.push(chunk);
        }

        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks[0].token).toBe('Hello');
      }

      await session.dispose();
    });
  });

  describe('Multi-Provider Registration', () => {
    it('should register both device and cloud providers simultaneously', async () => {
      const models: InferenceProviderConfig[] = [
        {
          type: 'device',
          model: 'onnx-community/Qwen3-0.6B-ONNX',
          quantization: 'q4',
          engine: 'webgpu',
        },
        {
          type: 'cloud',
          model: 'claude-sonnet-4',
          proxyUrl: 'https://api.example.com/anthropic',
        },
      ];

      const session = await createSession({ models });

      // Verify both providers are registered
      const providerManager = (session as any)._providerManager;
      const allProviders = providerManager.getAllProviders();

      expect(allProviders.size).toBe(2);
      expect(allProviders.has('onnx-community/Qwen3-0.6B-ONNX')).toBe(true);
      expect(allProviders.has('claude-sonnet-4')).toBe(true);

      await session.dispose();
    });

    it('should register multiple providers with different model names', async () => {
      const models: InferenceProviderConfig[] = [
        {
          type: 'device',
          model: 'onnx-community/Qwen3-0.6B-ONNX',
          quantization: 'q4',
          engine: 'webgpu',
        },
        {
          type: 'cloud',
          model: 'claude-sonnet-4',
          proxyUrl: 'https://api.example.com/anthropic',
        },
        {
          type: 'cloud',
          model: 'gpt-4',
          proxyUrl: 'https://api.example.com/openai',
          modelProvider: 'openai',
        },
      ];

      const session = await createSession({ models });

      const providerManager = (session as any)._providerManager;
      const allProviders = providerManager.getAllProviders();

      expect(allProviders.size).toBe(3);
      expect(allProviders.has('onnx-community/Qwen3-0.6B-ONNX')).toBe(true);
      expect(allProviders.has('claude-sonnet-4')).toBe(true);
      expect(allProviders.has('gpt-4')).toBe(true);

      await session.dispose();
    });

    it('should verify each provider maintains independent state', async () => {
      const models: InferenceProviderConfig[] = [
        {
          type: 'device',
          model: 'onnx-community/Qwen3-0.6B-ONNX',
          quantization: 'q4',
          engine: 'webgpu',
        },
        {
          type: 'cloud',
          model: 'claude-sonnet-4',
          proxyUrl: 'https://api.example.com/anthropic',
        },
      ];

      const session = await createSession({ models });

      const providerManager = (session as any)._providerManager;
      const deviceProvider = await providerManager.getProvider('onnx-community/Qwen3-0.6B-ONNX');
      const cloudProvider = await providerManager.getProvider('claude-sonnet-4');

      // Verify providers are different instances
      expect(deviceProvider).not.toBe(cloudProvider);
      expect(deviceProvider.getModelName()).toBe('onnx-community/Qwen3-0.6B-ONNX');
      expect(cloudProvider.getModelName()).toBe('claude-sonnet-4');

      await session.dispose();
    });
  });

  describe('Provider Switching During Session', () => {
    it('should switch between device and cloud providers', async () => {
      const models: InferenceProviderConfig[] = [
        {
          type: 'device',
          model: 'onnx-community/Qwen3-0.6B-ONNX',
          quantization: 'q4',
          engine: 'webgpu',
        },
        {
          type: 'cloud',
          model: 'claude-sonnet-4',
          proxyUrl: 'https://api.example.com/anthropic',
        },
      ];

      const session = await createSession({ models });

      // Setup device worker mock
      const mockWorker = (global.Worker as any).mock.results[0].value;
      mockWorker.postMessage = vi.fn((msg) => {
        if (msg.type === 'generate') {
          setTimeout(() => {
            mockWorker.onmessage?.({
              data: { type: 'chunk', requestId: msg.requestId, args: { token: 'Device', tokenId: 1 } },
            });
            mockWorker.onmessage?.({
              data: { type: 'complete', requestId: msg.requestId },
            });
          }, 10);
        } else if (msg.type === 'init') {
          setTimeout(() => {
            mockWorker.onmessage?.({
              data: { type: 'complete', requestId: msg.requestId },
            });
          }, 10);
        }
      });

      // Setup cloud fetch mock
      const cloudMockBody = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"token":"Cloud","tokenId":1}\n\n'));
          controller.enqueue(
            new TextEncoder().encode('data: {"token":"","tokenId":-1,"isLast":true}\n\n')
          );
          controller.close();
        },
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name === 'Content-Type' ? 'text/event-stream' : null),
        },
        body: cloudMockBody,
      });

      // Generate with device provider
      const deviceResponse = await session.createResponse('onnx-community/Qwen3-0.6B-ONNX', {
        messages: [{ role: 'user', content: 'Test device' }],
      });

      expect(deviceResponse.type).toBe('streaming');

      if (deviceResponse.type === 'streaming') {
        const chunks: any[] = [];
        for await (const chunk of deviceResponse.stream) {
          chunks.push(chunk);
        }
        expect(chunks.length).toBeGreaterThan(0);
      }

      // Switch to cloud provider
      const cloudResponse = await session.createResponse('claude-sonnet-4', {
        messages: [{ role: 'user', content: 'Test cloud' }],
      });

      expect(cloudResponse.type).toBe('streaming');

      if (cloudResponse.type === 'streaming') {
        const chunks: any[] = [];
        for await (const chunk of cloudResponse.stream) {
          chunks.push(chunk);
        }
        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks[0].token).toBe('Cloud');
      }

      await session.dispose();
    });

    it('should alternate between providers multiple times', async () => {
      const models: InferenceProviderConfig[] = [
        {
          type: 'device',
          model: 'onnx-community/Qwen3-0.6B-ONNX',
          quantization: 'q4',
          engine: 'webgpu',
        },
        {
          type: 'cloud',
          model: 'claude-sonnet-4',
          proxyUrl: 'https://api.example.com/anthropic',
        },
      ];

      const session = await createSession({ models });

      // Setup mocks
      const mockWorker = (global.Worker as any).mock.results[0].value;
      let callCount = 0;

      mockWorker.postMessage = vi.fn((msg) => {
        if (msg.type === 'generate') {
          const count = ++callCount;
          setTimeout(() => {
            mockWorker.onmessage?.({
              data: {
                type: 'chunk',
                requestId: msg.requestId,
                args: { token: `Device${count}`, tokenId: 1 },
              },
            });
            mockWorker.onmessage?.({
              data: { type: 'complete', requestId: msg.requestId },
            });
          }, 10);
        } else if (msg.type === 'init') {
          setTimeout(() => {
            mockWorker.onmessage?.({
              data: { type: 'complete', requestId: msg.requestId },
            });
          }, 10);
        }
      });

      (global.fetch as any).mockImplementation(() => {
        const cloudCallCount = ++callCount;
        return Promise.resolve({
          ok: true,
          headers: {
            get: (name: string) => (name === 'Content-Type' ? 'text/event-stream' : null),
          },
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(`data: {"token":"Cloud${cloudCallCount}","tokenId":1}\n\n`)
              );
              controller.enqueue(
                new TextEncoder().encode('data: {"token":"","tokenId":-1,"isLast":true}\n\n')
              );
              controller.close();
            },
          }),
        });
      });

      // Alternate 3 times
      for (let i = 0; i < 3; i++) {
        // Device
        const deviceResponse = await session.createResponse('onnx-community/Qwen3-0.6B-ONNX', {
          messages: [{ role: 'user', content: `Test ${i}` }],
        });

        if (deviceResponse.type === 'streaming') {
          for await (const chunk of deviceResponse.stream) {
            // Consume stream
          }
        }

        // Cloud
        const cloudResponse = await session.createResponse('claude-sonnet-4', {
          messages: [{ role: 'user', content: `Test ${i}` }],
        });

        if (cloudResponse.type === 'streaming') {
          for await (const chunk of cloudResponse.stream) {
            // Consume stream
          }
        }
      }

      // Verify both were called multiple times
      expect(callCount).toBe(6); // 3 device + 3 cloud

      await session.dispose();
    });
  });

  describe('Mixed Provider Workflows', () => {
    it('should handle tool calling with both providers', async () => {
      const models: InferenceProviderConfig[] = [
        {
          type: 'device',
          model: 'onnx-community/Qwen3-0.6B-ONNX',
          quantization: 'q4',
          engine: 'webgpu',
        },
        {
          type: 'cloud',
          model: 'claude-sonnet-4',
          proxyUrl: 'https://api.example.com/anthropic',
        },
      ];

      const session = await createSession({ models });

      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'get_weather',
            description: 'Get weather',
            parameters: {
              type: 'object' as const,
              properties: {
                city: { type: 'string' },
              },
              required: ['city'],
            },
          },
        },
      ];

      // Mock cloud provider with tools (non-streaming when tools are present)
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => (name === 'Content-Type' ? 'application/json' : null),
        },
        json: async () => ({
          content: 'Tool response',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"city":"SF"}',
              },
            },
          ],
        }),
      });

      const response = await session.createResponse('claude-sonnet-4', {
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools,
      });

      expect(response.type).toBe('complete');
      if (response.type === 'complete') {
        expect(response.toolCalls).toBeDefined();
      }

      await session.dispose();
    });

    it('should maintain different generation parameters per provider', async () => {
      const models: InferenceProviderConfig[] = [
        {
          type: 'device',
          model: 'onnx-community/Qwen3-0.6B-ONNX',
          quantization: 'q4',
          engine: 'webgpu',
        },
        {
          type: 'cloud',
          model: 'claude-sonnet-4',
          proxyUrl: 'https://api.example.com/anthropic',
        },
      ];

      const session = await createSession({ models });

      // Setup mocks
      const mockWorker = (global.Worker as any).mock.results[0].value;
      let deviceParams: any = null;

      mockWorker.postMessage = vi.fn((msg) => {
        if (msg.type === 'generate') {
          deviceParams = msg.args;
          setTimeout(() => {
            mockWorker.onmessage?.({
              data: { type: 'chunk', requestId: msg.requestId, args: { token: 'Device', tokenId: 1 } },
            });
            mockWorker.onmessage?.({
              data: { type: 'complete', requestId: msg.requestId },
            });
          }, 10);
        } else if (msg.type === 'init') {
          setTimeout(() => {
            mockWorker.onmessage?.({
              data: { type: 'complete', requestId: msg.requestId },
            });
          }, 10);
        }
      });

      let cloudParams: any = null;

      (global.fetch as any).mockImplementation((url: string, options: any) => {
        cloudParams = JSON.parse(options.body);
        return Promise.resolve({
          ok: true,
          headers: {
            get: (name: string) => (name === 'Content-Type' ? 'text/event-stream' : null),
          },
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: {"token":"Cloud","tokenId":1}\n\n'));
              controller.enqueue(
                new TextEncoder().encode('data: {"token":"","tokenId":-1,"isLast":true}\n\n')
              );
              controller.close();
            },
          }),
        });
      });

      // Generate with different parameters
      const deviceResponse = await session.createResponse('onnx-community/Qwen3-0.6B-ONNX', {
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.5,
        max_new_tokens: 100,
      });

      if (deviceResponse.type === 'streaming') {
        for await (const chunk of deviceResponse.stream) {
          // Consume
        }
      }

      const cloudResponse = await session.createResponse('claude-sonnet-4', {
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.9,
        max_tokens: 500,
      });

      if (cloudResponse.type === 'streaming') {
        for await (const chunk of cloudResponse.stream) {
          // Consume
        }
      }

      // Verify parameters were passed correctly
      expect(deviceParams?.temperature).toBe(0.5);
      expect(deviceParams?.max_new_tokens).toBe(100);
      expect(cloudParams?.temperature).toBe(0.9);
      expect(cloudParams?.max_tokens).toBe(500);

      await session.dispose();
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should throw clear error for non-existent model', async () => {
      const models: InferenceProviderConfig[] = [
        {
          type: 'device',
          model: 'onnx-community/Qwen3-0.6B-ONNX',
          quantization: 'q4',
          engine: 'webgpu',
        },
      ];

      const session = await createSession({ models });

      await expect(async () => {
        await session.createResponse('non-existent-model', {
          messages: [{ role: 'user', content: 'Test' }],
        });
      }).rejects.toThrow(/No model configuration found for: non-existent-model/);

      await session.dispose();
    });

    it('should provide helpful error message with available models', async () => {
      const models: InferenceProviderConfig[] = [
        {
          type: 'device',
          model: 'onnx-community/Qwen3-0.6B-ONNX',
          quantization: 'q4',
          engine: 'webgpu',
        },
        {
          type: 'cloud',
          model: 'claude-sonnet-4',
          proxyUrl: 'https://api.example.com/anthropic',
        },
      ];

      const session = await createSession({ models });

      try {
        await session.createResponse('gpt-4', {
          messages: [{ role: 'user', content: 'Test' }],
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Available models:');
        expect(error.message).toContain('onnx-community/Qwen3-0.6B-ONNX');
        expect(error.message).toContain('claude-sonnet-4');
      }

      await session.dispose();
    });

    it('should handle provider initialization failure gracefully', async () => {
      // This test verifies that if one provider fails, it throws immediately
      // In the current implementation, failures throw during createSession
      const invalidConfig: InferenceProviderConfig = {
        type: 'device',
        model: 'unsupported-model',
        quantization: 'q4',
        engine: 'webgpu',
      };

      await expect(async () => {
        await createSession({ models: [invalidConfig] });
      }).rejects.toThrow();
    });
  });

  describe('Resource Management', () => {
    it('should dispose all providers when session is disposed', async () => {
      const models: InferenceProviderConfig[] = [
        {
          type: 'device',
          model: 'onnx-community/Qwen3-0.6B-ONNX',
          quantization: 'q4',
          engine: 'webgpu',
        },
        {
          type: 'cloud',
          model: 'claude-sonnet-4',
          proxyUrl: 'https://api.example.com/anthropic',
        },
      ];

      const session = await createSession({ models });

      const providerManager = (session as any)._providerManager;
      const initialSize = providerManager.getAllProviders().size;

      expect(initialSize).toBe(2);

      await session.dispose();

      const finalSize = providerManager.getAllProviders().size;
      expect(finalSize).toBe(0);
    });

    it('should handle concurrent requests to different providers', async () => {
      const models: InferenceProviderConfig[] = [
        {
          type: 'device',
          model: 'onnx-community/Qwen3-0.6B-ONNX',
          quantization: 'q4',
          engine: 'webgpu',
        },
        {
          type: 'cloud',
          model: 'claude-sonnet-4',
          proxyUrl: 'https://api.example.com/anthropic',
        },
      ];

      const session = await createSession({ models });

      // Setup mocks
      const mockWorker = (global.Worker as any).mock.results[0].value;
      mockWorker.postMessage = vi.fn((msg) => {
        if (msg.type === 'generate') {
          setTimeout(() => {
            mockWorker.onmessage?.({
              data: { type: 'chunk', requestId: msg.requestId, args: { token: 'Device', tokenId: 1 } },
            });
            mockWorker.onmessage?.({
              data: { type: 'complete', requestId: msg.requestId },
            });
          }, 50); // Longer delay
        } else if (msg.type === 'init') {
          setTimeout(() => {
            mockWorker.onmessage?.({
              data: { type: 'complete', requestId: msg.requestId },
            });
          }, 10);
        }
      });

      (global.fetch as any).mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              headers: {
                get: (name: string) => (name === 'Content-Type' ? 'text/event-stream' : null),
              },
              body: new ReadableStream({
                start(controller) {
                  controller.enqueue(
                    new TextEncoder().encode('data: {"token":"Cloud","tokenId":1}\n\n')
                  );
                  controller.enqueue(
                    new TextEncoder().encode('data: {"token":"","tokenId":-1,"isLast":true}\n\n')
                  );
                  controller.close();
                },
              }),
            });
          }, 50); // Same delay
        });
      });

      // Start concurrent requests
      const devicePromise = session.createResponse('onnx-community/Qwen3-0.6B-ONNX', {
        messages: [{ role: 'user', content: 'Test device' }],
      });

      const cloudPromise = session.createResponse('claude-sonnet-4', {
        messages: [{ role: 'user', content: 'Test cloud' }],
      });

      const [deviceResponse, cloudResponse] = await Promise.all([devicePromise, cloudPromise]);

      expect(deviceResponse.type).toBe('streaming');
      expect(cloudResponse.type).toBe('streaming');

      // Consume both streams
      const consumePromises = [];

      if (deviceResponse.type === 'streaming') {
        consumePromises.push(
          (async () => {
            const chunks: any[] = [];
            for await (const chunk of deviceResponse.stream) {
              chunks.push(chunk);
            }
            return chunks;
          })()
        );
      }

      if (cloudResponse.type === 'streaming') {
        consumePromises.push(
          (async () => {
            const chunks: any[] = [];
            for await (const chunk of cloudResponse.stream) {
              chunks.push(chunk);
            }
            return chunks;
          })()
        );
      }

      const [deviceChunks, cloudChunks] = await Promise.all(consumePromises);

      expect(deviceChunks.length).toBeGreaterThan(0);
      expect(cloudChunks.length).toBeGreaterThan(0);

      await session.dispose();
    });

    it('should properly clean up event listeners', async () => {
      const models: InferenceProviderConfig[] = [
        {
          type: 'device',
          model: 'onnx-community/Qwen3-0.6B-ONNX',
          quantization: 'q4',
          engine: 'webgpu',
        },
        {
          type: 'cloud',
          model: 'claude-sonnet-4',
          proxyUrl: 'https://api.example.com/anthropic',
        },
      ];

      const session = await createSession({ models });

      const events: any[] = [];
      const unsubscribe = session.on('*', (event) => {
        events.push(event);
      });

      // Trigger some events
      const mockWorker = (global.Worker as any).mock.results[0].value;
      mockWorker.postMessage = vi.fn((msg) => {
        if (msg.type === 'generate') {
          setTimeout(() => {
            mockWorker.onmessage?.({
              data: { type: 'chunk', requestId: msg.requestId, args: { token: 'Test', tokenId: 1 } },
            });
            mockWorker.onmessage?.({
              data: { type: 'complete', requestId: msg.requestId },
            });
          }, 10);
        } else if (msg.type === 'init') {
          setTimeout(() => {
            mockWorker.onmessage?.({
              data: { type: 'complete', requestId: msg.requestId },
            });
          }, 10);
        }
      });

      const response = await session.createResponse('onnx-community/Qwen3-0.6B-ONNX', {
        messages: [{ role: 'user', content: 'Test' }],
      });

      if (response.type === 'streaming') {
        for await (const chunk of response.stream) {
          // Consume
        }
      }

      const eventsBeforeUnsubscribe = events.length;
      expect(eventsBeforeUnsubscribe).toBeGreaterThan(0);

      // Unsubscribe and verify no more events
      unsubscribe();

      await session.dispose();

      // No new events should have been added after unsubscribe
      expect(events.length).toBe(eventsBeforeUnsubscribe);
    });
  });

  describe('Event System Integration', () => {
    it('should emit events with correct model names when switching', async () => {
      const models: InferenceProviderConfig[] = [
        {
          type: 'device',
          model: 'onnx-community/Qwen3-0.6B-ONNX',
          quantization: 'q4',
          engine: 'webgpu',
        },
        {
          type: 'cloud',
          model: 'claude-sonnet-4',
          proxyUrl: 'https://api.example.com/anthropic',
        },
      ];

      const session = await createSession({ models });

      const events: any[] = [];
      session.on('*', (event) => {
        events.push(event);
      });

      // Setup mocks
      const mockWorker = (global.Worker as any).mock.results[0].value;
      mockWorker.postMessage = vi.fn((msg) => {
        if (msg.type === 'generate') {
          setTimeout(() => {
            mockWorker.onmessage?.({
              data: { type: 'chunk', requestId: msg.requestId, args: { token: 'Device', tokenId: 1 } },
            });
            mockWorker.onmessage?.({
              data: { type: 'complete', requestId: msg.requestId },
            });
          }, 10);
        } else if (msg.type === 'init') {
          setTimeout(() => {
            mockWorker.onmessage?.({
              data: { type: 'complete', requestId: msg.requestId },
            });
          }, 10);
        }
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name === 'Content-Type' ? 'text/event-stream' : null),
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"token":"Cloud","tokenId":1}\n\n'));
            controller.enqueue(
              new TextEncoder().encode('data: {"token":"","tokenId":-1,"isLast":true}\n\n')
            );
            controller.close();
          },
        }),
      });

      // Generate with device
      const deviceResponse = await session.createResponse('onnx-community/Qwen3-0.6B-ONNX', {
        messages: [{ role: 'user', content: 'Test' }],
      });

      if (deviceResponse.type === 'streaming') {
        for await (const chunk of deviceResponse.stream) {
          // Consume
        }
      }

      // Generate with cloud
      const cloudResponse = await session.createResponse('claude-sonnet-4', {
        messages: [{ role: 'user', content: 'Test' }],
      });

      if (cloudResponse.type === 'streaming') {
        for await (const chunk of cloudResponse.stream) {
          // Consume
        }
      }

      // Verify events contain correct model names
      const generationStartEvents = events.filter((e) => e.type === 'generation:start');

      expect(generationStartEvents.length).toBeGreaterThan(0);

      const deviceEvent = generationStartEvents.find(
        (e) => e.modelName === 'onnx-community/Qwen3-0.6B-ONNX'
      );
      const cloudEvent = generationStartEvents.find((e) => e.modelName === 'claude-sonnet-4');

      expect(deviceEvent).toBeDefined();
      expect(cloudEvent).toBeDefined();

      await session.dispose();
    });
  });
});
