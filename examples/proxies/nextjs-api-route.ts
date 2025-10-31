/**
 * Next.js API Route for Cloud LLM Proxy
 *
 * Supports: Anthropic, OpenAI, and generic OpenAI-compatible APIs
 *
 * Setup:
 * 1. Copy this file to your Next.js project:
 *    - App Router: app/api/llm/[provider]/route.ts
 *    - Pages Router: pages/api/llm/[provider].ts
 *
 * 2. Set environment variables:
 *    ANTHROPIC_API_KEY=sk-ant-...
 *    OPENAI_API_KEY=sk-...
 *
 * 3. Configure Agentary.js:
 *    cloudConfig: { proxyUrl: '/api/llm/anthropic' }
 */

import { NextRequest, NextResponse } from 'next/server';

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

// Simple in-memory rate limiter (replace with Redis in production)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const requests = rateLimitMap.get(identifier) || [];

  // Remove old requests outside the window
  const recentRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);

  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  recentRequests.push(now);
  rateLimitMap.set(identifier, recentRequests);
  return true;
}

/**
 * App Router API Route Handler
 * Use this for Next.js App Router (app directory)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  try {
    const provider = params.provider as keyof typeof PROVIDER_ENDPOINTS;

    // Validate provider
    if (!PROVIDER_ENDPOINTS[provider]) {
      return NextResponse.json(
        { error: `Unsupported provider: ${provider}` },
        { status: 400 }
      );
    }

    // Rate limiting (use IP address as identifier)
    const clientIp = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'unknown';

    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // Get API key from environment
    const apiKeyEnvVar = API_KEY_ENV_VARS[provider];
    const apiKey = process.env[apiKeyEnvVar];

    if (!apiKey) {
      console.error(`${apiKeyEnvVar} not configured`);
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await request.json();

    // Validate required fields
    if (!body.model || !body.messages) {
      return NextResponse.json(
        { error: 'Missing required fields: model, messages' },
        { status: 400 }
      );
    }

    // Optional: Enforce max tokens to control costs
    if (body.max_tokens && body.max_tokens > 4096) {
      body.max_tokens = 4096;
    }

    // Build headers based on provider
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Forward request to cloud provider
    const apiEndpoint = PROVIDER_ENDPOINTS[provider];
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    // Handle errors from cloud provider
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${provider} API error:`, errorText);

      return NextResponse.json(
        {
          error: `${provider} API error`,
          details: errorText
        },
        { status: response.status }
      );
    }

    // For streaming responses, return stream
    if (body.stream) {
      return new NextResponse(response.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // For non-streaming, return JSON
    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * Pages Router API Route Handler
 * Use this for Next.js Pages Router (pages directory)
 *
 * File: pages/api/llm/[provider].ts
 */
export async function handler(req: any, res: any) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { provider } = req.query;

    // Validate provider
    if (!PROVIDER_ENDPOINTS[provider as keyof typeof PROVIDER_ENDPOINTS]) {
      return res.status(400).json({ error: `Unsupported provider: ${provider}` });
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
    const apiKeyEnvVar = API_KEY_ENV_VARS[provider as keyof typeof API_KEY_ENV_VARS];
    const apiKey = process.env[apiKeyEnvVar];

    if (!apiKey) {
      console.error(`${apiKeyEnvVar} not configured`);
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const body = req.body;

    // Validate required fields
    if (!body.model || !body.messages) {
      return res.status(400).json({
        error: 'Missing required fields: model, messages'
      });
    }

    // Enforce max tokens
    if (body.max_tokens && body.max_tokens > 4096) {
      body.max_tokens = 4096;
    }

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Forward request
    const apiEndpoint = PROVIDER_ENDPOINTS[provider as keyof typeof PROVIDER_ENDPOINTS];
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${provider} API error:`, errorText);
      return res.status(response.status).json({
        error: `${provider} API error`,
        details: errorText
      });
    }

    // Stream response
    if (body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      response.body?.pipe(res);
    } else {
      const data = await response.json();
      res.status(200).json(data);
    }

  } catch (error: any) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

// Export for Pages Router
export default handler;
