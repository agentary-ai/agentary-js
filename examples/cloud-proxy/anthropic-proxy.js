/**
 * Example proxy server for Anthropic Claude API
 *
 * This proxy forwards requests from the Agentary JS CloudProvider to Anthropic's API,
 * handling authentication and transforming the response to SSE format.
 *
 * Usage:
 *   npm install express @anthropic-ai/sdk dotenv
 *   ANTHROPIC_API_KEY=your-key node anthropic-proxy.js
 */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.use(express.json());

// Enable CORS for browser requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

/**
 * Proxy endpoint for Anthropic API
 *
 * Accepts requests from CloudProvider and forwards to Anthropic,
 * streaming the response back as SSE.
 */
app.post('/api/anthropic', async (req, res) => {
  try {
    const { model, messages, max_tokens, temperature, top_p, tools, tool_choice } = req.body;

    console.log(`[${new Date().toISOString()}] Request for model: ${model}`);

    // Validate required fields
    if (!model || !messages) {
      return res.status(400).json({
        error: 'Missing required fields: model and messages are required'
      });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Transform request to Anthropic format
    const anthropicRequest = {
      model,
      messages,
      max_tokens: max_tokens || 1024,
      stream: true,
      ...(temperature !== undefined && { temperature }),
      ...(top_p !== undefined && { top_p }),
      ...(tools && { tools }),
      ...(tool_choice && { tool_choice }),
    };

    // Create streaming request to Anthropic
    const stream = await anthropic.messages.create(anthropicRequest);

    let tokenCount = 0;
    const startTime = Date.now();

    // Stream tokens back to client
    for await (const event of stream) {
      // Handle different event types
      if (event.type === 'content_block_start') {
        continue;
      }

      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          const isFirst = tokenCount === 0;
          const chunk = {
            token: event.delta.text,
            tokenId: tokenCount,
            isFirst,
            ...(isFirst && { ttfbMs: Date.now() - startTime }),
          };

          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          tokenCount++;
        }
      }

      if (event.type === 'message_delta') {
        if (event.delta.stop_reason) {
          // Mark the last token
          const lastChunk = {
            token: '',
            tokenId: tokenCount,
            isFirst: false,
            isLast: true,
          };
          res.write(`data: ${JSON.stringify(lastChunk)}\n\n`);
        }
      }

      if (event.type === 'message_stop') {
        res.write('data: [DONE]\n\n');
        break;
      }

      if (event.type === 'error') {
        res.write(`error: ${JSON.stringify({
          message: event.error?.message || 'Unknown error',
          statusCode: 500,
          code: event.error?.type || 'UNKNOWN_ERROR'
        })}\n\n`);
        break;
      }
    }

    res.end();
    console.log(`[${new Date().toISOString()}] Request completed. Tokens: ${tokenCount}`);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error:`, error.message);

    // If headers already sent, write error in SSE format
    if (res.headersSent) {
      res.write(`error: ${JSON.stringify({
        message: error.message,
        statusCode: error.status || 500,
        code: error.error?.type || 'PROXY_ERROR'
      })}\n\n`);
      res.end();
    } else {
      // Otherwise send standard HTTP error
      res.status(error.status || 500).json({
        error: error.message,
        type: error.error?.type || 'proxy_error'
      });
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'anthropic-proxy' });
});

app.listen(PORT, () => {
  console.log(`Anthropic proxy server running on port ${PORT}`);
  console.log(`Endpoint: http://localhost:${PORT}/api/anthropic`);
  console.log(`Health check: http://localhost:${PORT}/health`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('\n⚠️  WARNING: ANTHROPIC_API_KEY not set in environment variables\n');
  }
});
