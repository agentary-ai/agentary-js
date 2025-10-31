/**
 * Cloudflare Worker for Cloud LLM Proxy
 *
 * Supports: Anthropic, OpenAI, and generic OpenAI-compatible APIs
 *
 * Setup:
 * 1. Install Wrangler CLI:
 *    npm install -g wrangler
 *
 * 2. Create wrangler.toml in your project:
 *    name = "agentary-llm-proxy"
 *    main = "cloudflare-worker.js"
 *    compatibility_date = "2024-01-01"
 *
 * 3. Set secrets:
 *    wrangler secret put ANTHROPIC_API_KEY
 *    wrangler secret put OPENAI_API_KEY
 *
 * 4. Deploy:
 *    wrangler deploy
 *
 * 5. Configure Agentary.js:
 *    cloudConfig: { proxyUrl: 'https://your-worker.workers.dev/anthropic' }
 */

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

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Rate limiter using Cloudflare KV (optional)
 * For production, use Cloudflare KV or Durable Objects for distributed rate limiting
 */
async function checkRateLimit(env, clientIp) {
  // Simple rate limiting using KV (requires KV namespace binding)
  if (!env.RATE_LIMIT_KV) {
    return true; // Skip if KV not configured
  }

  const key = `ratelimit:${clientIp}`;
  const now = Date.now();
  const window = 60000; // 1 minute
  const maxRequests = 60;

  try {
    const data = await env.RATE_LIMIT_KV.get(key, { type: 'json' });
    const requests = data?.requests || [];

    // Remove old requests
    const recentRequests = requests.filter(time => now - time < window);

    if (recentRequests.length >= maxRequests) {
      return false;
    }

    recentRequests.push(now);
    await env.RATE_LIMIT_KV.put(key, JSON.stringify({ requests: recentRequests }), {
      expirationTtl: 60 // Expire after 1 minute
    });

    return true;
  } catch (error) {
    console.error('Rate limit check error:', error);
    return true; // Allow on error
  }
}

/**
 * Main request handler
 */
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const provider = url.pathname.split('/')[1]; // Extract provider from path

  // Validate provider
  if (!PROVIDER_ENDPOINTS[provider]) {
    return new Response(
      JSON.stringify({ error: `Unsupported provider: ${provider}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Rate limiting
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateLimitOk = await checkRateLimit(env, clientIp);

  if (!rateLimitOk) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get API key from environment
  const apiKeyEnvVar = API_KEY_ENV_VARS[provider];
  const apiKey = env[apiKeyEnvVar];

  if (!apiKey) {
    console.error(`${apiKeyEnvVar} not configured`);
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate required fields
  if (!body.model || !body.messages) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: model, messages' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
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

  try {
    // Forward request to cloud provider
    const apiEndpoint = PROVIDER_ENDPOINTS[provider];
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${provider} API error:`, errorText);

      return new Response(
        JSON.stringify({
          error: `${provider} API error`,
          details: errorText
        }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // For streaming responses, pass through
    if (body.stream) {
      return new Response(response.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...CORS_HEADERS
        }
      });
    }

    // For non-streaming, return JSON
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Main worker entry point
 */
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Handle request
    return handleRequest(request, env);
  }
};
