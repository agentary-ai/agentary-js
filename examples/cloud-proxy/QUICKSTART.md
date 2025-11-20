# Cloud Proxy Quick Start Guide

Get up and running with cloud providers in 5 minutes!

## Step 1: Install Dependencies

```bash
cd examples/cloud-proxy
npm install
```

## Step 2: Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and add your API key
nano .env
```

Add your API key:
```bash
# For Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxx

# OR for OpenAI
OPENAI_API_KEY=sk-xxxxx
```

## Step 3: Start Proxy Server

```bash
# For Anthropic
npm run start:anthropic

# OR for OpenAI
npm run start:openai
```

You should see:
```
Anthropic proxy server running on port 3001
Endpoint: http://localhost:3001/api/anthropic
Health check: http://localhost:3001/health
```

## Step 4: Test the Proxy

Open a new terminal and test with curl:

```bash
# Test Anthropic proxy
curl -X POST http://localhost:3001/api/anthropic \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'
```

## Step 5: Use in Your App

In your application:

```typescript
import { createSession } from 'agentary-js';

const session = await createSession({
  models: [{
    runtime: 'anthropic',
    proxyUrl: 'http://localhost:3001/api/anthropic',
    model: 'claude-3-5-sonnet-20241022'
  }]
});

for await (const chunk of session.createResponse({
  model: 'claude-3-5-sonnet-20241022',
  messages: [{ role: 'user', content: 'Hello!' }],
  max_tokens: 100
})) {
  console.log(chunk.token);
}
```

## Common Issues

### Port Already in Use

Change the port in `.env`:
```bash
PORT=3003
```

### API Key Not Found

Make sure `.env` file exists and contains your API key:
```bash
# Check if .env exists
ls -la .env

# Check contents (be careful not to share this!)
cat .env
```

### CORS Error in Browser

The proxy allows all origins by default in development. For production, set:
```bash
CORS_ORIGIN=https://yourdomain.com
```

## Next Steps

- Read the full [README.md](README.md) for advanced features
- Check out [client-example.js](client-example.js) for usage examples
- Deploy to production (see README.md deployment section)

## Getting API Keys

### Anthropic
1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Navigate to API Keys
4. Create a new key
5. Copy and paste into `.env`

### OpenAI
1. Go to https://platform.openai.com/
2. Sign up or log in
3. Navigate to API Keys
4. Create a new key
5. Copy and paste into `.env`

## Support

For issues or questions:
- Check the main [README.md](README.md)
- Review [Agentary JS documentation](../../README.md)
- Open an issue on GitHub