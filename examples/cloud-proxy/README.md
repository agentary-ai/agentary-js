# Cloud Proxy Examples

This directory contains example proxy server implementations for use with the Agentary JS CloudProvider.

## Overview

The CloudProvider uses a **proxy pattern** where your backend server handles API authentication and forwards requests to cloud LLM providers (Anthropic, OpenAI, etc.). This approach:

- ✅ Keeps API keys secure on your backend (never exposed to browser)
- ✅ Allows custom rate limiting, caching, and monitoring
- ✅ Enables request/response transformation
- ✅ Supports multiple LLM providers with a single SDK

## Available Examples

### 1. Anthropic Claude Proxy ([anthropic-proxy.js](anthropic-proxy.js))

Forwards requests to Anthropic's Claude API.

**Supported Models:**
- `claude-haiku-4-5`
- `claude-sonnet-4-5`
- `claude-opus-4-1`
- etc...

You can view the available models at the following (link)[https://docs.claude.com/en/docs/about-claude/models/overview]

### 2. OpenAI Proxy ([openai-proxy.js](openai-proxy.js))

Forwards requests to OpenAI's Chat Completions API.

**Supported Models:**
- `gpt-5`
- `gpt-5-mini`
- `gpt-5-nano`
- etc...

You can view the available models at the following (link)[https://platform.openai.com/docs/models]

## Quick Start

### Prerequisites

```bash
# Node.js 18+ required
node --version
```

### Installation

```bash
cd examples/cloud-proxy

# Install dependencies for Anthropic proxy
npm install express @anthropic-ai/sdk dotenv

# OR install dependencies for OpenAI proxy
npm install express openai dotenv
```

### Configuration

Create a `.env` file in this directory:

```bash
# For Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxx
PORT=3001

# For OpenAI
OPENAI_API_KEY=sk-xxxxx
PORT=3002
```

### Running the Proxy

```bash
# Start Anthropic proxy
ANTHROPIC_API_KEY=your-key node anthropic-proxy.js

# OR start OpenAI proxy
OPENAI_API_KEY=your-key node openai-proxy.js
```

The proxy will start on the configured port (default 3001 for Anthropic, 3002 for OpenAI).

## Using with Agentary JS

### Example: Anthropic Claude

```typescript
import { createSession } from 'agentary-js';

const session = await createSession({
  models: [
    {
      type: 'cloud',
      proxyUrl: 'http://localhost:3001/api/anthropic',
      model: 'claude-3-5-sonnet-20241022',
      timeout: 30000,
      maxRetries: 3
    }
  ]
});

// Generate a response
for await (const chunk of session.createResponse({
  model: 'claude-3-5-sonnet-20241022',
  messages: [
    { role: 'user', content: 'Hello! How are you?' }
  ],
  max_tokens: 1024
})) {
  console.log(chunk.token);
}
```

### Example: OpenAI

```typescript
import { createSession } from 'agentary-js';

const session = await createSession({
  models: [
    {
      type: 'cloud',
      proxyUrl: 'http://localhost:3002/api/openai',
      model: 'gpt-4o',
      timeout: 30000,
      maxRetries: 3
    }
  ]
});

// Generate a response
for await (const chunk of session.createResponse({
  model: 'gpt-4o',
  messages: [
    { role: 'user', content: 'Explain quantum computing in simple terms' }
  ],
  max_tokens: 500
})) {
  console.log(chunk.token);
}
```

## API Contract

### Request Format

Your proxy receives POST requests with the following JSON body:

```typescript
{
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  tools?: Array<ToolDefinition>;
  tool_choice?: string | object;
}
```

### Response Format (SSE)

Your proxy should return Server-Sent Events (SSE) with the following format:

```
data: {"token":"Hello","tokenId":0,"isFirst":true,"ttfbMs":245}

data: {"token":" world","tokenId":1}

data: {"token":"!","tokenId":2,"isLast":true}

data: [DONE]
```

**Chunk Schema:**
```typescript
{
  token: string;           // The text token
  tokenId: number;         // Sequential token ID
  isFirst?: boolean;       // First token in stream
  isLast?: boolean;        // Last token in stream
  ttfbMs?: number;         // Time to first byte (ms) - only on first token
}
```

### Error Format

For errors during streaming, send:

```
error: {"message":"API error message","statusCode":500,"code":"ERROR_CODE"}
```

For errors before streaming starts, return standard HTTP error:

```json
{
  "error": "Error message",
  "type": "error_type"
}
```

## Production Deployment

### Security Considerations

1. **API Key Protection**
   - Never expose API keys to the client
   - Store keys in environment variables or secret management systems
   - Rotate keys regularly

2. **CORS Configuration**
   - Restrict origins in production (don't use `*`)
   - Example: `res.header('Access-Control-Allow-Origin', 'https://yourdomain.com')`

3. **Rate Limiting**
   - Add rate limiting middleware (e.g., `express-rate-limit`)
   - Example:
     ```javascript
     import rateLimit from 'express-rate-limit';

     const limiter = rateLimit({
       windowMs: 15 * 60 * 1000, // 15 minutes
       max: 100 // limit each IP to 100 requests per windowMs
     });

     app.use('/api/', limiter);
     ```

4. **Authentication**
   - Add authentication middleware to verify client requests
   - Use JWT, API keys, or OAuth

5. **Logging & Monitoring**
   - Log requests for debugging and auditing
   - Monitor error rates and latency
   - Set up alerts for anomalies

### Deployment Options

#### 1. **Node.js Server (PM2)**

```bash
npm install -g pm2
pm2 start anthropic-proxy.js --name "anthropic-proxy"
pm2 save
pm2 startup
```

#### 2. **Docker**

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3001
CMD ["node", "anthropic-proxy.js"]
```

Build and run:

```bash
docker build -t anthropic-proxy .
docker run -p 3001:3001 -e ANTHROPIC_API_KEY=your-key anthropic-proxy
```

#### 3. **Serverless (AWS Lambda + API Gateway)**

Use frameworks like:
- [Serverless Framework](https://www.serverless.com/)
- [AWS SAM](https://aws.amazon.com/serverless/sam/)
- [Vercel](https://vercel.com/) (for Next.js API routes)

#### 4. **Cloud Platforms**

- **Heroku**: `git push heroku main`
- **Railway**: Connect GitHub repo
- **Render**: Deploy from GitHub
- **Fly.io**: `fly deploy`

### Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-xxxxx
# OR
OPENAI_API_KEY=sk-xxxxx

# Optional
PORT=3001
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN=https://yourdomain.com
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=900000
```

## Advanced Features

### Adding Request Logging

```javascript
app.post('/api/anthropic', async (req, res) => {
  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Request started`, {
    model: req.body.model,
    messageCount: req.body.messages?.length,
    timestamp: new Date().toISOString()
  });

  // ... proxy logic ...

  console.log(`[${requestId}] Request completed`, {
    tokenCount,
    duration: Date.now() - startTime
  });
});
```

### Adding Caching

```javascript
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour TTL

app.post('/api/anthropic', async (req, res) => {
  const cacheKey = JSON.stringify(req.body);
  const cached = cache.get(cacheKey);

  if (cached) {
    // Return cached response
    return res.json(cached);
  }

  // ... forward to API and cache result ...
});
```

### Adding Cost Tracking

```javascript
const COST_PER_1K_TOKENS = {
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'gpt-4o': { input: 0.005, output: 0.015 },
};

app.post('/api/anthropic', async (req, res) => {
  // ... after streaming completes ...

  const cost = (tokenCount / 1000) * COST_PER_1K_TOKENS[model].output;
  console.log(`Request cost: $${cost.toFixed(4)}`);

  // Store in database for billing
  await db.logUsage({
    userId: req.user.id,
    model,
    tokens: tokenCount,
    cost
  });
});
```

## Troubleshooting

### Common Issues

**1. CORS Errors**
```
Access to fetch at 'http://localhost:3001/api/anthropic' from origin 'http://localhost:5173'
has been blocked by CORS policy
```

**Solution:** Make sure CORS headers are set correctly in the proxy.

**2. Connection Timeout**
```
ProviderTimeoutError: Request timed out after 60000ms
```

**Solution:** Increase the timeout in CloudProvider config or check network connectivity.

**3. API Key Invalid**
```
ProviderAPIError: Proxy returned error: 401 Unauthorized
```

**Solution:** Verify your API key is correct and has proper permissions.

**4. Empty Response**
```
ProviderError: No tokens received from provider
```

**Solution:** Check that your proxy is sending data in the correct SSE format.

### Debug Mode

Enable verbose logging:

```javascript
// Add detailed logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body);
  next();
});
```

### Testing the Proxy

Use curl to test:

```bash
# Test health endpoint
curl http://localhost:3001/health

# Test streaming endpoint
curl -X POST http://localhost:3001/api/anthropic \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 100
  }'
```

## Contributing

Feel free to submit pull requests with:
- Additional provider examples (Cohere, Mistral, etc.)
- Improved error handling
- Production-ready features (auth, monitoring, etc.)
- Performance optimizations

## License

These examples are provided as-is for educational purposes. Use them as a starting point for your own proxy implementation.
