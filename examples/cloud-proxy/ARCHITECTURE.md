# Cloud Proxy Architecture

## Overview

The CloudProvider uses a proxy pattern to keep API keys secure while enabling browser-based LLM inference.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │           Your Web Application                         │    │
│  │                                                          │    │
│  │  ┌──────────────────────────────────────────────────┐  │    │
│  │  │         Agentary JS SDK                          │  │    │
│  │  │                                                  │  │    │
│  │  │  ┌────────────────────────────────────────┐    │  │    │
│  │  │  │      CloudProvider                     │    │  │    │
│  │  │  │                                        │    │  │    │
│  │  │  │  • SSE Streaming                       │    │  │    │
│  │  │  │  • Retry Logic                         │    │  │    │
│  │  │  │  • Timeout Handling                    │    │  │    │
│  │  │  │  • Error Management                    │    │  │    │
│  │  │  └────────────────────────────────────────┘    │  │    │
│  │  │                                                  │  │    │
│  │  └──────────────────────────────────────────────────┘  │    │
│  │                                                          │    │
│  └────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              │ HTTPS POST                        │
│                              │ (No API Keys!)                    │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Your Backend Server                           │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              Proxy Server                              │    │
│  │         (anthropic-proxy.js / openai-proxy.js)        │    │
│  │                                                          │    │
│  │  Features:                                              │    │
│  │  • API Key Management (from env vars)                  │    │
│  │  • Request Transformation                               │    │
│  │  • Response Streaming (SSE)                             │    │
│  │  • Rate Limiting                                        │    │
│  │  • Logging & Monitoring                                 │    │
│  │  • Cost Tracking                                        │    │
│  │  • Caching (optional)                                   │    │
│  │                                                          │    │
│  └────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              │ HTTPS POST                        │
│                              │ (With API Keys)                   │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Cloud LLM Provider                           │
│                                                                  │
│  ┌──────────────────┐              ┌──────────────────┐        │
│  │  Anthropic API   │              │   OpenAI API     │        │
│  │                  │              │                  │        │
│  │  claude-3-5-*    │              │   gpt-4o         │        │
│  │  claude-3-opus   │              │   gpt-4-turbo    │        │
│  │  claude-3-haiku  │              │   gpt-3.5-turbo  │        │
│  └──────────────────┘              └──────────────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Request Flow

### 1. Client Request

```typescript
// Browser: Your Application
const session = await createSession({
  models: [{
    runtime: 'anthropic',
    proxyUrl: 'https://your-backend.com/api/anthropic',
    model: 'claude-3-5-sonnet-20241022'
  }]
});

for await (const chunk of session.createResponse({
  messages: [{ role: 'user', content: 'Hello' }],
  max_tokens: 100
})) {
  console.log(chunk.token);
}
```

### 2. Request to Proxy

**CloudProvider sends:**
```http
POST https://your-backend.com/api/anthropic
Content-Type: application/json

{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "max_tokens": 100
}
```

### 3. Proxy to LLM Provider

**Proxy server forwards:**
```http
POST https://api.anthropic.com/v1/messages
x-api-key: sk-ant-xxxxx
anthropic-version: 2023-06-01
Content-Type: application/json

{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "max_tokens": 100,
  "stream": true
}
```

### 4. Streaming Response

**Proxy transforms and streams back:**
```
data: {"token":"Hello","tokenId":0,"isFirst":true,"ttfbMs":245}

data: {"token":"!","tokenId":1}

data: {"token":" How","tokenId":2}

data: {"token":" can","tokenId":3}

data: {"token":" I","tokenId":4}

data: {"token":" help","tokenId":5}

data: {"token":"?","tokenId":6,"isLast":true}

data: [DONE]
```

### 5. Client Receives Tokens

**CloudProvider yields chunks:**
```typescript
{
  token: "Hello",
  tokenId: 0,
  isFirst: true,
  ttfbMs: 245
}
{
  token: "!",
  tokenId: 1,
  isFirst: false
}
// ... more chunks
{
  token: "?",
  tokenId: 6,
  isLast: true
}
```

## Security Model

### What's Secure ✅

1. **API Keys Never in Browser**
   - Keys stored only on backend server
   - Environment variables or secret management
   - Never exposed to client-side code

2. **HTTPS/TLS Encryption**
   - All communication encrypted
   - Protects data in transit

3. **Backend Authentication**
   - Optional: Add auth to proxy endpoints
   - JWT, OAuth, API keys for clients

4. **Rate Limiting**
   - Control usage per user/IP
   - Prevent abuse

5. **Request Validation**
   - Sanitize inputs on backend
   - Validate model names, parameters
   - Prevent prompt injection

### Best Practices 🔒

```javascript
// 1. Validate requests
app.post('/api/anthropic', authenticate, async (req, res) => {
  // Check user authentication
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Validate model
  const allowedModels = ['claude-3-5-sonnet-20241022'];
  if (!allowedModels.includes(req.body.model)) {
    return res.status(400).json({ error: 'Invalid model' });
  }

  // Check user's rate limit
  const userLimit = await checkRateLimit(req.user.id);
  if (userLimit.exceeded) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  // Forward to API...
});

// 2. Set CORS properly
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://yourdomain.com');
  // Don't use '*' in production!
  next();
});

// 3. Log all requests
app.use((req, res, next) => {
  logger.info('API Request', {
    userId: req.user?.id,
    model: req.body.model,
    timestamp: new Date().toISOString()
  });
  next();
});

// 4. Monitor costs
await db.logUsage({
  userId: req.user.id,
  model,
  tokens: tokenCount,
  cost: calculateCost(tokenCount, model),
  timestamp: Date.now()
});
```

## Error Handling Flow

```
┌──────────────┐
│   Browser    │
│  CloudProvider│
└──────┬───────┘
       │
       │ Request
       ▼
┌──────────────┐
│    Proxy     │
│   Server     │
└──────┬───────┘
       │
       ├─► Network Error ──► ProviderNetworkError
       │
       ├─► Timeout ──────► ProviderTimeoutError
       │
       ├─► 4xx Error ────► ProviderAPIError (no retry)
       │
       ├─► 5xx Error ────► ProviderAPIError (retry with backoff)
       │
       └─► Success ──────► Stream tokens
```

### Retry Strategy

```
Attempt 1: Immediate
          │
          ├─► Success ──► Done
          │
          └─► Error
                │
                ▼
          Wait 1 second
                │
Attempt 2: After 1s delay
          │
          ├─► Success ──► Done
          │
          └─► Error
                │
                ▼
          Wait 2 seconds
                │
Attempt 3: After 2s delay
          │
          ├─► Success ──► Done
          │
          └─► Error ──► Throw error
```

## Scaling Considerations

### Horizontal Scaling

```
                    Load Balancer
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    Proxy Server 1  Proxy Server 2  Proxy Server 3
         │               │               │
         └───────────────┼───────────────┘
                         │
                    LLM Provider
```

### Vertical Scaling

- Increase server CPU/RAM
- Use clustering (PM2)
- Optimize request handling

### Caching Layer

```
Browser
  │
  ▼
Proxy Server
  │
  ├─► Redis Cache ──► Hit ──► Return cached response
  │                   │
  │                   └─► Miss
  │                       │
  ▼                       ▼
LLM Provider          Forward to API
  │                       │
  └───────────────────────┘
         Cache result
```

### Queue System

```
High Traffic
     │
     ▼
Request Queue (Redis/RabbitMQ)
     │
     ├─► Worker 1 ──► LLM Provider
     ├─► Worker 2 ──► LLM Provider
     └─► Worker 3 ──► LLM Provider
```

## Monitoring & Observability

### Metrics to Track

1. **Request Metrics**
   - Requests per second
   - Success/error rates
   - Response times (p50, p95, p99)

2. **Token Metrics**
   - Tokens per request
   - Total tokens per hour/day
   - Cost per user/team

3. **Error Metrics**
   - Error rates by type
   - Retry rates
   - Timeout rates

4. **Business Metrics**
   - Active users
   - API usage trends
   - Cost per user

### Example Monitoring

```javascript
import { metrics } from './monitoring';

app.post('/api/anthropic', async (req, res) => {
  const startTime = Date.now();

  try {
    // Process request...

    metrics.increment('requests.success');
    metrics.timing('requests.duration', Date.now() - startTime);
    metrics.increment('tokens.used', tokenCount);

  } catch (error) {
    metrics.increment('requests.error');
    metrics.increment(`requests.error.${error.constructor.name}`);
  }
});
```

## Deployment Architectures

### Simple: Single Server

```
Internet ──► Single Node.js Server ──► LLM Provider
              (Express + Proxy)
```

**Pros:** Simple, cheap
**Cons:** Single point of failure

### Medium: Load Balanced

```
Internet ──► Load Balancer ──┬──► Server 1 ──┐
                             ├──► Server 2 ──┤──► LLM Provider
                             └──► Server 3 ──┘
```

**Pros:** High availability, scalable
**Cons:** More complex, higher cost

### Advanced: Serverless

```
Internet ──► API Gateway ──► Lambda Functions ──► LLM Provider
                                  (Auto-scale)
```

**Pros:** Infinite scale, pay per request
**Cons:** Cold starts, complexity

### Enterprise: Full Stack

```
Internet
  │
  ▼
CDN (CloudFlare)
  │
  ▼
Load Balancer (AWS ALB)
  │
  ├──► API Gateway
  │      │
  │      ├──► Authentication Service
  │      ├──► Rate Limiter (Redis)
  │      └──► Proxy Servers (ECS/K8s)
  │              │
  │              ├──► Cache (Redis)
  │              └──► Queue (SQS)
  │
  └──► Monitoring (DataDog/New Relic)
  │
  ▼
LLM Providers
```

## Next Steps

- Implement the proxy for your use case
- Add authentication and authorization
- Set up monitoring and alerting
- Deploy to production
- Scale as needed
