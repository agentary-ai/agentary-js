# Cloud LLM Implementation Summary

This document summarizes the implementation of cloud LLM support in Agentary.js.

## Overview

Agentary.js now supports **hybrid inference** - combining local WebGPU models with cloud LLM providers (Anthropic, OpenAI, and generic OpenAI-compatible APIs) in a secure, browser-first architecture.

## Architecture

### Provider Abstraction Layer

```
Session
   ↓
ProviderManager (routes to appropriate provider)
   ├─→ WebGPUProvider (local inference via Web Workers)
   └─→ CloudProvider (secure proxy-based inference)
         ├─→ AnthropicProvider
         ├─→ OpenAIProvider
         └─→ GenericProvider (Groq, Together, etc.)
```

### Key Design Decisions

1. **Browser-Only, Proxy-Based**: Cloud LLMs are accessed via user-provided backend proxies to keep API keys secure
2. **Hybrid Mode**: Different `GenerationTask` types can use different backends
3. **Backward Compatible**: Existing WebGPU code works without changes
4. **Provider Agnostic**: Easy to add new cloud providers
5. **Streaming First**: All providers return `AsyncIterable<TokenStreamChunk>`

## Implementation Details

### 1. Core Provider System

#### Files Created:
- `src/providers/base.ts` - Base interfaces and error types
- `src/providers/manager.ts` - Provider selection and lifecycle management
- `src/providers/webgpu-provider.ts` - WebGPU provider (refactored from WorkerManager)

**Key Interfaces:**

```typescript
interface InferenceProvider {
  initialize(): Promise<void>;
  generate(args: GenerateArgs, task?: GenerationTask): AsyncIterable<TokenStreamChunk>;
  dispose(): Promise<void>;
  isInitialized(): boolean;
  getProviderType(): ProviderType;
  getModelName(): string;
}

interface CloudProviderConfig {
  proxyUrl: string;       // Required: user's backend endpoint
  model?: string;         // Optional: model override
  headers?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
}
```

### 2. Cloud Provider Implementation

#### Files Created:
- `src/providers/cloud/base-cloud-provider.ts` - Base class with HTTP client and SSE streaming
- `src/providers/cloud/anthropic-provider.ts` - Anthropic Messages API
- `src/providers/cloud/openai-provider.ts` - OpenAI Chat Completions API
- `src/providers/cloud/generic-provider.ts` - Generic OpenAI-compatible

**Features:**
- Automatic retry with exponential backoff
- SSE (Server-Sent Events) streaming parser
- Provider-specific message format conversion
- Tool calling support for all providers
- Comprehensive error handling

### 3. Session Updates

#### Modified Files:
- `src/core/session.ts` - Now uses `ProviderManager` instead of `WorkerManager`
- `src/types/session.ts` - Removed `workerManager` from Session interface
- `src/index.ts` - Export new provider types

**API Changes:**

```typescript
// Before: Only supported WebGPU
const session = await createSession({
  models: {
    chat: { name: 'Qwen3', quantization: 'q4' }
  }
});

// After: Supports both WebGPU and Cloud
const session = await createSession({
  models: {
    chat: {
      name: 'Qwen3',
      provider: 'webgpu',  // NEW
      quantization: 'q4'
    },
    tool_use: {
      name: 'claude-3-5-sonnet',
      provider: 'anthropic',  // NEW
      cloudConfig: {          // NEW
        proxyUrl: '/api/anthropic/messages'
      }
    }
  }
});
```

### 4. Proxy Examples

#### Files Created:
- `examples/proxies/README.md` - Comprehensive proxy documentation
- `examples/proxies/nextjs-api-route.ts` - Next.js App Router & Pages Router
- `examples/proxies/express-proxy.js` - Express.js middleware
- `examples/proxies/cloudflare-worker.js` - Cloudflare Workers edge function

**Features:**
- Multi-provider support (Anthropic, OpenAI, Groq, Together)
- Rate limiting (in-memory for examples)
- Streaming support
- CORS configuration
- Error handling
- Security best practices

### 5. Documentation

#### Files Created:
- `examples/cloud-llm-usage.md` - Complete usage guide with examples
- `CLOUD_LLM_IMPLEMENTATION.md` - This file

## Usage Examples

### Hybrid Mode (Recommended)

```typescript
const session = await createSession({
  models: {
    // Local WebGPU for fast, private chat
    chat: {
      name: 'onnx-community/Qwen3-0.6B-ONNX',
      provider: 'webgpu',
      quantization: 'q4'
    },

    // Cloud for complex reasoning
    tool_use: {
      name: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      cloudConfig: {
        proxyUrl: '/api/anthropic/messages'
      }
    }
  }
});
```

### Cloud Only

```typescript
const session = await createSession({
  models: {
    chat: {
      name: 'gpt-4o',
      provider: 'openai',
      cloudConfig: {
        proxyUrl: '/api/openai/chat',
        timeout: 60000,
        maxRetries: 3
      }
    }
  }
});
```

### Multiple Cloud Providers

```typescript
const session = await createSession({
  models: {
    chat: {
      name: 'llama-3.3-70b-versatile',
      provider: 'generic',
      cloudConfig: {
        proxyUrl: '/api/groq/chat'
      }
    },
    tool_use: {
      name: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      cloudConfig: {
        proxyUrl: '/api/anthropic/messages'
      }
    }
  }
});
```

## Security

### Browser Security Model

```
❌ INSECURE (Never do this):
Browser → Direct API call with API key → Cloud LLM
         ⚠️  API key visible to users!

✅ SECURE (Always do this):
Browser → Your Backend Proxy → Cloud LLM
         🔒 API key stays on server
```

### Best Practices

1. **Never expose API keys in browser code**
2. **Always use backend proxy** for cloud LLMs
3. **Implement rate limiting** in proxy
4. **Validate requests** before forwarding
5. **Use HTTPS** in production
6. **Add authentication** if needed (user-level rate limits)
7. **Log usage** for cost tracking

## Provider Capabilities

| Feature | WebGPU | Anthropic | OpenAI | Generic |
|---------|--------|-----------|--------|---------|
| Streaming | ✅ | ✅ | ✅ | ✅ |
| Tool Calling | ✅ | ✅ | ✅ | ✅ |
| Thinking/Reasoning | ✅ | ✅ | ✅ | ⚠️  |
| Cost | Free | Pay | Pay | Varies |
| Privacy | 100% | Cloud | Cloud | Cloud |
| Speed | Fast | Fast | Fast | Varies |
| Offline | ✅ | ❌ | ❌ | ❌ |

## Error Handling

The implementation includes comprehensive error handling:

```typescript
// Error Types
- ProviderError - Base error class
- ProviderNetworkError - Network/connection errors
- ProviderTimeoutError - Request timeouts
- ProviderConfigurationError - Invalid configuration
- ProviderAPIError - API-level errors (4xx, 5xx)

// Automatic Retry Logic
- Retries on 5xx errors and rate limits (429)
- Exponential backoff (1s, 2s, 4s, 8s, max 10s)
- Configurable max retries (default: 3)
```

## Performance Considerations

### Streaming

All providers support streaming for low latency:
- WebGPU: Direct worker message passing
- Cloud: SSE (Server-Sent Events) parsing
- First token time (TTFB) tracking
- Tokens per second calculation

### Memory

- Providers are reused across requests
- Cleanup on dispose
- Event emitter cleanup
- Worker termination (WebGPU)

### Network

- HTTP/2 multiplexing support
- Configurable timeouts
- Automatic retry with backoff
- Request cancellation support

## Testing

### Manual Testing

1. **WebGPU Provider** (existing functionality)
   ```bash
   npm run test:webgpu
   ```

2. **Cloud Providers** (requires proxy setup)
   ```bash
   # Start proxy
   node examples/proxies/express-proxy.js

   # Test in browser
   npm run dev
   ```

3. **Hybrid Mode**
   ```bash
   # Test mixing WebGPU and cloud
   npm run test:hybrid
   ```

## Future Enhancements

### Potential Additions

1. **More Providers**
   - Cohere
   - Google Gemini
   - Azure OpenAI
   - AWS Bedrock

2. **Advanced Features**
   - Response caching
   - Request queuing
   - Fallback providers
   - A/B testing
   - Cost tracking
   - Usage analytics

3. **Developer Experience**
   - Provider health checks
   - Automatic provider selection
   - Built-in rate limiting
   - Request middleware
   - Response transformers

4. **Enterprise Features**
   - Multi-tenancy support
   - Custom authentication
   - Advanced logging
   - Metrics export
   - Compliance features

## Migration Guide

### For Existing Users

**No breaking changes!** Existing code continues to work:

```typescript
// Old code (still works)
const session = await createSession({
  models: {
    chat: {
      name: 'onnx-community/Qwen3-0.6B-ONNX',
      quantization: 'q4'
    }
  }
});
```

**To opt-in to cloud LLMs:**

```typescript
// New code (with cloud support)
const session = await createSession({
  models: {
    chat: {
      name: 'onnx-community/Qwen3-0.6B-ONNX',
      provider: 'webgpu',  // Add this
      quantization: 'q4'
    },
    tool_use: {
      name: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',  // Add this
      cloudConfig: {           // Add this
        proxyUrl: '/api/anthropic/messages'
      }
    }
  }
});
```

## File Structure

```
src/
├── providers/
│   ├── base.ts                           # Base interfaces & errors
│   ├── manager.ts                        # Provider manager
│   ├── webgpu-provider.ts               # WebGPU implementation
│   └── cloud/
│       ├── base-cloud-provider.ts       # Cloud base class
│       ├── anthropic-provider.ts        # Anthropic implementation
│       ├── openai-provider.ts           # OpenAI implementation
│       └── generic-provider.ts          # Generic implementation
├── core/
│   ├── session.ts                       # Updated to use ProviderManager
│   └── agent-session.ts                 # (unchanged)
├── types/
│   ├── session.ts                       # Updated Session interface
│   └── worker.ts                        # (unchanged)
└── utils/
    └── logger-config.ts                 # Added provider loggers

examples/
├── proxies/
│   ├── README.md                        # Proxy documentation
│   ├── nextjs-api-route.ts             # Next.js proxy
│   ├── express-proxy.js                # Express proxy
│   └── cloudflare-worker.js            # Cloudflare proxy
└── cloud-llm-usage.md                  # Usage guide
```

## Summary

This implementation adds secure, production-ready cloud LLM support to Agentary.js while:

✅ Maintaining backward compatibility
✅ Keeping API keys secure (browser-only, proxy-based)
✅ Supporting hybrid local+cloud workflows
✅ Providing comprehensive documentation and examples
✅ Following security best practices
✅ Enabling flexible provider selection

The architecture is extensible and makes it easy to add new providers in the future.
