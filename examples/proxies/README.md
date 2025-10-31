# Cloud LLM Proxy Examples

This directory contains example proxy server implementations for securely connecting Agentary.js to cloud LLM providers.

## Why Proxies?

Agentary.js runs in the browser and supports both:
- **WebGPU models** - Run directly in the browser (no proxy needed)
- **Cloud LLMs** - Require API keys that must stay secure on your backend

**Security Rule**: Never expose API keys in browser code. Always use a backend proxy.

## Architecture

```
Browser (Agentary.js)  →  Your Backend Proxy  →  Cloud LLM API
   (No API keys)           (API keys secure)      (Anthropic, OpenAI, etc.)
```

## Available Examples

### 1. Next.js API Route (`nextjs-api-route.ts`)
- **Best for**: Next.js applications (App Router or Pages Router)
- **Setup**: Drop into `pages/api/` or `app/api/` directory
- **Features**: Built-in rate limiting, streaming support

### 2. Express.js Middleware (`express-proxy.js`)
- **Best for**: Traditional Node.js backends, REST APIs
- **Setup**: Add as Express middleware or standalone endpoint
- **Features**: CORS support, error handling, streaming

### 3. Cloudflare Worker (`cloudflare-worker.js`)
- **Best for**: Serverless edge deployments, global latency optimization
- **Setup**: Deploy to Cloudflare Workers
- **Features**: Edge computing, minimal cold starts, global distribution

## Quick Start

### 1. Choose a Provider

Each example supports multiple cloud providers:
- **Anthropic** (Claude models)
- **OpenAI** (GPT models)
- **Generic** (Groq, Together, Fireworks, etc.)

### 2. Set Environment Variables

```bash
# For Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# For OpenAI
OPENAI_API_KEY=sk-...

# For generic providers (e.g., Groq)
GROQ_API_KEY=gsk_...
```

### 3. Deploy Proxy

Copy the appropriate example to your backend and deploy.

### 4. Configure Agentary.js

```typescript
import { createSession } from 'agentary';

const session = await createSession({
  models: {
    chat: {
      name: 'onnx-community/Qwen3-0.6B-ONNX',
      provider: 'webgpu',
      quantization: 'q4'
    },
    tool_use: {
      name: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      cloudConfig: {
        proxyUrl: '/api/anthropic/messages' // Your proxy endpoint
      }
    }
  }
});
```

## Security Best Practices

### ✅ DO
- Store API keys in environment variables
- Validate requests before forwarding
- Implement rate limiting
- Log errors (not sensitive data)
- Use HTTPS in production
- Add authentication if needed

### ❌ DON'T
- Hardcode API keys in code
- Expose API keys in browser
- Skip request validation
- Forward all headers blindly
- Ignore rate limits

## Advanced Features

### Rate Limiting

Protect your API keys and control costs:

```typescript
// Simple in-memory rate limiter
const requests = new Map();
const RATE_LIMIT = 60; // requests per minute

function checkRateLimit(userId) {
  const now = Date.now();
  const userRequests = requests.get(userId) || [];
  const recentRequests = userRequests.filter(t => now - t < 60000);

  if (recentRequests.length >= RATE_LIMIT) {
    throw new Error('Rate limit exceeded');
  }

  recentRequests.push(now);
  requests.set(userId, recentRequests);
}
```

### Authentication

Add user authentication to control access:

```typescript
// Check authentication token
const authToken = req.headers.authorization;
if (!authToken || !validateToken(authToken)) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

### Request Filtering

Filter or modify requests before sending to LLM:

```typescript
// Limit max tokens to control costs
if (body.max_tokens > 4000) {
  body.max_tokens = 4000;
}

// Filter sensitive content
if (containsSensitiveData(body.messages)) {
  return res.status(400).json({ error: 'Sensitive content detected' });
}
```

### Usage Tracking

Track usage for billing or analytics:

```typescript
// Log usage
await database.logUsage({
  userId,
  model: body.model,
  tokens: response.usage?.total_tokens,
  timestamp: new Date()
});
```

## Troubleshooting

### CORS Errors

If you see CORS errors in the browser console:

```typescript
// Add CORS headers in your proxy
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
```

### Streaming Not Working

Ensure your proxy properly forwards streaming responses:

```typescript
// Set correct headers for streaming
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');

// Pipe response without buffering
apiResponse.body.pipe(res);
```

### API Key Not Found

Check environment variables are loaded:

```typescript
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY not set');
  return res.status(500).json({ error: 'Server configuration error' });
}
```

## Testing

Test your proxy before using with Agentary.js:

```bash
# Test Anthropic proxy
curl -X POST http://localhost:3000/api/anthropic/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100,
    "stream": true
  }'
```

## Support

For questions or issues:
- [GitHub Issues](https://github.com/yourusername/agentary-js/issues)
- [Documentation](https://agentary.dev/docs)
