# Cloud LLM Usage Guide

This guide demonstrates how to use Agentary.js with cloud LLM providers (Anthropic, OpenAI, etc.) in a secure, browser-based environment.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Your Web App)                                     │
│                                                              │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Agentary.js                                        │   │
│  │                                                      │   │
│  │  ┌──────────────┐         ┌──────────────────┐    │   │
│  │  │   WebGPU     │         │   Cloud Provider  │    │   │
│  │  │   Provider   │         │      (Proxy)      │    │   │
│  │  │              │         │                   │    │   │
│  │  │  • Qwen3     │         │  • Anthropic      │────┼───┼─→ Your Backend
│  │  │  • SmolLM    │         │  • OpenAI         │    │   │   (Proxy Server)
│  │  │  • Phi-3     │         │  • Generic        │    │   │
│  │  └──────────────┘         └──────────────────┘    │   │
│  │                                                      │   │
│  │  Hybrid Mode: Mix local & cloud models!            │   │
│  └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │  Your Backend Proxy              │
                    │  (API Keys Secure Here)          │
                    └─────────────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │  Cloud LLM APIs                  │
                    │  • Anthropic                     │
                    │  • OpenAI                        │
                    │  • Groq, Together, etc.          │
                    └─────────────────────────────────┘
```

## Quick Start

### 1. Set Up Backend Proxy

Choose a proxy implementation from `/examples/proxies/`:
- `nextjs-api-route.ts` - For Next.js apps
- `express-proxy.js` - For Express.js servers
- `cloudflare-worker.js` - For Cloudflare Workers

### 2. Install Agentary.js

```bash
npm install agentary
```

### 3. Create a Hybrid Session

```typescript
import { createSession } from 'agentary';

const session = await createSession({
  models: {
    // Use WebGPU for fast, private chat
    chat: {
      name: 'onnx-community/Qwen3-0.6B-ONNX',
      provider: 'webgpu',
      quantization: 'q4'
    },

    // Use Claude for complex reasoning & tool use
    tool_use: {
      name: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      cloudConfig: {
        proxyUrl: '/api/anthropic/messages'
      }
    }
  }
});

// Chat using WebGPU (runs locally in browser)
for await (const chunk of session.createResponse({
  messages: [
    { role: 'user', content: 'Hello! How are you?' }
  ]
})) {
  process.stdout.write(chunk.token);
}

// Tool use with Claude (via backend proxy)
for await (const chunk of session.createResponse({
  messages: [
    { role: 'user', content: 'What is the weather in San Francisco?' }
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name' }
          },
          required: ['location']
        }
      }
    }
  ]
}, 'tool_use')) {
  process.stdout.write(chunk.token);
}
```

## Use Cases

### 1. Pure Cloud (No WebGPU)

Use only cloud models if you don't want local inference:

```typescript
const session = await createSession({
  models: {
    chat: {
      name: 'gpt-4o',
      provider: 'openai',
      cloudConfig: {
        proxyUrl: '/api/openai/chat'
      }
    }
  }
});
```

### 2. Hybrid: Local Chat + Cloud Reasoning

Best of both worlds - fast local chat, powerful cloud reasoning:

```typescript
const session = await createSession({
  models: {
    // Fast local chat (no API costs!)
    chat: {
      name: 'onnx-community/SmolLM2-360M-ONNX',
      provider: 'webgpu',
      quantization: 'q4'
    },

    // Cloud for complex tasks
    tool_use: {
      name: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      cloudConfig: {
        proxyUrl: '/api/anthropic/messages'
      }
    },

    reasoning: {
      name: 'o1-preview',
      provider: 'openai',
      cloudConfig: {
        proxyUrl: '/api/openai/chat'
      }
    }
  }
});

// Use appropriate model for each task
const chatResponse = await session.createResponse({
  messages: [{ role: 'user', content: 'Hi!' }]
}, 'chat'); // Uses local WebGPU

const reasoningResponse = await session.createResponse({
  messages: [{ role: 'user', content: 'Solve this math problem...' }]
}, 'reasoning'); // Uses o1-preview via proxy
```

### 3. Multiple Cloud Providers

Mix different providers for different tasks:

```typescript
const session = await createSession({
  models: {
    chat: {
      name: 'llama-3.3-70b-versatile',
      provider: 'generic',
      cloudConfig: {
        proxyUrl: '/api/groq/chat' // Fast Groq inference
      }
    },

    tool_use: {
      name: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      cloudConfig: {
        proxyUrl: '/api/anthropic/messages' // Claude for tools
      }
    }
  }
});
```

## Provider-Specific Configuration

### Anthropic (Claude)

```typescript
{
  name: 'claude-3-5-sonnet-20241022',
  provider: 'anthropic',
  cloudConfig: {
    proxyUrl: '/api/anthropic/messages',
    timeout: 60000, // Optional: 60 second timeout
    maxRetries: 3,   // Optional: retry failed requests
    headers: {       // Optional: custom headers
      'X-Custom-Header': 'value'
    }
  }
}
```

**Available Models:**
- `claude-3-5-sonnet-20241022` - Best for most tasks
- `claude-3-5-haiku-20241022` - Fast and affordable
- `claude-3-opus-20240229` - Most capable

### OpenAI

```typescript
{
  name: 'gpt-4o',
  provider: 'openai',
  cloudConfig: {
    proxyUrl: '/api/openai/chat',
    timeout: 60000,
    maxRetries: 3
  }
}
```

**Available Models:**
- `gpt-4o` - Fastest GPT-4 level
- `gpt-4-turbo` - High intelligence
- `gpt-3.5-turbo` - Fast and affordable
- `o1-preview` - Advanced reasoning

### Generic (Groq, Together, etc.)

```typescript
{
  name: 'llama-3.3-70b-versatile',
  provider: 'generic',
  cloudConfig: {
    proxyUrl: '/api/groq/chat',
    timeout: 30000
  }
}
```

**Popular Providers:**
- **Groq**: Ultra-fast inference
- **Together AI**: Wide model selection
- **Fireworks**: Optimized inference

## Advanced Features

### Event Monitoring

```typescript
// Listen to provider events
session.on('generation:start', (event) => {
  console.log('Generation started:', event.modelName);
});

session.on('generation:token', (event) => {
  console.log('Token:', event.token);
});

session.on('generation:complete', (event) => {
  console.log('Done!', {
    duration: event.duration,
    tokensPerSecond: event.tokensPerSecond
  });
});

session.on('generation:error', (event) => {
  console.error('Error:', event.error);
});
```

### Streaming with React

```tsx
import { useState } from 'react';
import { createSession } from 'agentary';

function ChatComponent() {
  const [response, setResponse] = useState('');
  const [session] = useState(() => createSession({
    models: {
      chat: {
        name: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        cloudConfig: {
          proxyUrl: '/api/anthropic/messages'
        }
      }
    }
  }));

  async function sendMessage(message: string) {
    setResponse('');

    for await (const chunk of session.createResponse({
      messages: [{ role: 'user', content: message }]
    })) {
      setResponse(prev => prev + chunk.token);
    }
  }

  return (
    <div>
      <button onClick={() => sendMessage('Hello!')}>
        Send Message
      </button>
      <div>{response}</div>
    </div>
  );
}
```

### Tool Calling

```typescript
const tools = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web for information',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query'
          }
        },
        required: ['query']
      },
      implementation: async ({ query }) => {
        // Your search implementation
        return `Search results for: ${query}`;
      }
    }
  }
];

for await (const chunk of session.createResponse({
  messages: [
    { role: 'user', content: 'Search for AI news' }
  ],
  tools
}, 'tool_use')) {
  console.log(chunk.token);
}
```

### Cost Optimization

```typescript
// Use cheap local models for simple tasks
const session = await createSession({
  models: {
    // Free! Runs locally
    chat: {
      name: 'onnx-community/Qwen3-0.6B-ONNX',
      provider: 'webgpu',
      quantization: 'q4'
    },

    // Only pay for complex tasks
    tool_use: {
      name: 'claude-3-5-haiku-20241022', // Cheaper Claude
      provider: 'anthropic',
      cloudConfig: {
        proxyUrl: '/api/anthropic/messages'
      }
    }
  }
});
```

## Troubleshooting

### Error: "proxyUrl is required for cloud providers"

You must provide a `proxyUrl` in `cloudConfig`:

```typescript
cloudConfig: {
  proxyUrl: '/api/anthropic/messages' // ✓ Required
}
```

### Error: "CORS policy: No 'Access-Control-Allow-Origin' header"

Add CORS headers in your proxy:

```typescript
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
```

### Streaming Not Working

Ensure your proxy sets the correct headers:

```typescript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
```

### Rate Limit Errors

The proxy includes built-in rate limiting. Adjust limits in your proxy code:

```typescript
const RATE_LIMIT_MAX_REQUESTS = 60; // Increase if needed
const RATE_LIMIT_WINDOW = 60000; // 1 minute
```

## Best Practices

### 1. Use Hybrid Mode

Combine local and cloud for best performance and cost:

```typescript
{
  chat: { provider: 'webgpu' },     // Fast, free
  tool_use: { provider: 'anthropic' } // Powerful when needed
}
```

### 2. Set Timeouts

Prevent hanging requests:

```typescript
cloudConfig: {
  proxyUrl: '/api/anthropic/messages',
  timeout: 30000 // 30 seconds
}
```

### 3. Monitor Costs

Track API usage in your proxy:

```typescript
console.log('API request:', {
  provider,
  model: body.model,
  tokens: body.max_tokens,
  user: req.user?.id
});
```

### 4. Cache Responses

Cache common responses to reduce API calls:

```typescript
const cache = new Map();
const cacheKey = JSON.stringify(body.messages);

if (cache.has(cacheKey)) {
  return res.json(cache.get(cacheKey));
}
```

## Security Checklist

- ✅ API keys stored in environment variables
- ✅ Proxy validates all requests
- ✅ Rate limiting enabled
- ✅ CORS properly configured
- ✅ HTTPS in production
- ✅ Request/response logging (without sensitive data)
- ✅ User authentication (if needed)
- ✅ Input validation and sanitization

## Next Steps

- Explore the [proxy examples](/examples/proxies/)
- Read the [full API documentation](https://agentary.dev/docs)
- Join the [community Discord](https://discord.gg/agentary)
