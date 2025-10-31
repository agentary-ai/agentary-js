/**
 * Express.js Proxy for Cloud LLM APIs
 *
 * Supports: Anthropic, OpenAI, and generic OpenAI-compatible APIs
 *
 * Setup:
 * 1. Install dependencies:
 *    npm install express cors dotenv
 *
 * 2. Create .env file:
 *    ANTHROPIC_API_KEY=sk-ant-...
 *    OPENAI_API_KEY=sk-...
 *    PORT=3001
 *
 * 3. Run:
 *    node express-proxy.js
 *
 * 4. Configure Agentary.js:
 *    cloudConfig: { proxyUrl: 'http://localhost:3001/api/anthropic' }
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API endpoints for each provider
const PROVIDER_ENDPOINTS = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  together: 'https://api.together.xyz/v1/chat/completions',
};

// API key environment variable names
const API_KEY_ENV_VARS = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  groq: 'GROQ_API_KEY',
  together: 'TOGETHER_API_KEY',
};

// Simple in-memory rate limiter
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60;

function checkRateLimit(identifier) {
  const now = Date.now();
  const requests = rateLimitMap.get(identifier) || [];

  // Remove old requests
  const recentRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);

  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  recentRequests.push(now);
  rateLimitMap.set(identifier, recentRequests);
  return true;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Proxy endpoint
app.post('/api/:provider', async (req, res) => {
  const { provider } = req.params;

  try {
    // Validate provider
    if (!PROVIDER_ENDPOINTS[provider]) {
      return res.status(400).json({
        error: `Unsupported provider: ${provider}`
      });
    }

    // Rate limiting
    const clientIp = req.headers['x-forwarded-for'] ||
                     req.headers['x-real-ip'] ||
                     req.connection.remoteAddress;

    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again later.'
      });
    }

    // Get API key
    const apiKeyEnvVar = API_KEY_ENV_VARS[provider];
    const apiKey = process.env[apiKeyEnvVar];

    if (!apiKey) {
      console.error(`${apiKeyEnvVar} not configured`);
      return res.status(500).json({
        error: 'Server configuration error'
      });
    }

    const body = req.body;

    // Validate required fields
    if (!body.model || !body.messages) {
      return res.status(400).json({
        error: 'Missing required fields: model, messages'
      });
    }

    // Optional: Enforce max tokens
    if (body.max_tokens && body.max_tokens > 4096) {
      body.max_tokens = 4096;
    }

    // Build headers based on provider
    const headers = {
      'Content-Type': 'application/json',
    };

    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Log request (without sensitive data)
    console.log(`[${new Date().toISOString()}] ${provider} request:`, {
      model: body.model,
      messageCount: body.messages?.length,
      stream: body.stream
    });

    // Forward request to cloud provider
    const apiEndpoint = PROVIDER_ENDPOINTS[provider];
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    // Handle errors
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${provider} API error:`, errorText);

      return res.status(response.status).json({
        error: `${provider} API error`,
        details: errorText
      });
    }

    // Handle streaming response
    if (body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Pipe the response stream
      response.body.pipe(res);

      // Handle stream errors
      response.body.on('error', (error) => {
        console.error('Stream error:', error);
        res.end();
      });

      // Clean up on client disconnect
      req.on('close', () => {
        response.body.destroy();
      });
    } else {
      // Handle non-streaming response
      const data = await response.json();
      res.json(data);
    }

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Cloud LLM Proxy server running on http://localhost:${PORT}`);
  console.log(`📋 Endpoints:`);
  console.log(`   - Health: http://localhost:${PORT}/health`);
  Object.keys(PROVIDER_ENDPOINTS).forEach(provider => {
    console.log(`   - ${provider}: http://localhost:${PORT}/api/${provider}`);
  });
  console.log(`\n🔐 Configured API keys:`);
  Object.entries(API_KEY_ENV_VARS).forEach(([provider, envVar]) => {
    console.log(`   - ${provider}: ${process.env[envVar] ? '✓ Set' : '✗ Not set'}`);
  });
});

module.exports = app;
