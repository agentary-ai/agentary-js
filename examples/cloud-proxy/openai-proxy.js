/**
 * Example proxy server for OpenAI API
 *
 * This proxy forwards requests from the Agentary JS CloudProvider to OpenAI's API,
 * handling authentication and transforming the response to SSE format.
 *
 * Usage:
 *   npm install express openai dotenv
 *   OPENAI_API_KEY=your-key node openai-proxy.js
 */

import express from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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
 * Transform messages to OpenAI format (system -> developer role)
 */
// function transformMessages(messages) {
//   return messages.map(msg => {
//     if (msg.role === 'system') {
//       return { ...msg, role: 'developer' };
//     }
//     return msg;
//   });
// }

/**
 * Transform tools to OpenAI format
 */
function transformTools(tools) {
  if (!tools) return null;
  
  return tools.map(tool => ({
    type: 'function',
    ...tool,
  }));
}

/**
 * Build OpenAI API request object
 */
function buildOpenAIRequest({ model, messages, max_tokens, temperature, top_p, tools, tool_choice, stream = true }) {
  // const transformedMessages = transformMessages(messages);
  const transformedTools = transformTools(tools);

  return {
    model,
    input: messages,
    stream,
    ...(max_tokens && { max_tokens }),
    // ...(temperature !== undefined && { temperature }),
    ...(top_p !== undefined && { top_p }),
    ...(transformedTools && transformedTools.length > 0 && { tools: transformedTools }),
    ...(tool_choice && { tool_choice }),
  };
}

/**
 * Handle streaming response from OpenAI
 */
async function handleStreamingResponse(response, res) {
  // Set up SSE headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let tokenCount = 0;
  const startTime = Date.now();

  console.log('streaming response', response);

  // Stream tokens back to client
  for await (const chunk of response) {
    console.log('chunk', chunk);

    if (chunk.type === 'response.output_text.delta') {
      const isFirst = tokenCount === 0;

      const responseChunk = {
        token: chunk.delta,
        tokenId: chunk.item_id,
        isFirst,
        isLast: false,
        ...(isFirst && { ttfbMs: Date.now() - startTime }),
      };

      res.write(`data: ${JSON.stringify(responseChunk)}\n\n`);
      tokenCount++;
    }

    // Handle function/tool calls
    // if (chunk.type === 'response.output_item.done' && chunk.item.type === 'function_call') {
    //   const toolCallChunk = {
    //     token: JSON.stringify(chunk.item),
    //     tokenId: tokenCount,
    //     isFirst: tokenCount === 0,
    //     isLast: false,
    //     toolCall: true,
    //   };

    //   res.write(`data: ${JSON.stringify(toolCallChunk)}\n\n`);
    //   tokenCount++;
    // }

    if (chunk.type === 'response.completed') {
      // Send final done signal
      const responseChunk = {
        token: '',
        tokenId: '-1',
        isFirst: false,
        isLast: true,
      };
      res.write(`data: ${JSON.stringify(responseChunk)}\n\n`);
      break;
    }
  }

  res.end();
  console.log(`[${new Date().toISOString()}] Streaming request completed. Tokens: ${tokenCount}`);
}

/**
 * Handle errors for the proxy endpoint
 */
function handleProxyError(error, res) {
  console.error(`[${new Date().toISOString()}] Error:`, error.message);

  // If headers already sent, write error in SSE format
  if (res.headersSent) {
    res.write(`error: ${JSON.stringify({
      message: error.message,
      statusCode: error.status || 500,
      code: error.code || 'PROXY_ERROR'
    })}\n\n`);
    res.end();
  } else {
    // Otherwise send standard HTTP error
    res.status(error.status || 500).json({
      error: error.message,
      type: error.type || 'proxy_error'
    });
  }
}

/**
 * Proxy endpoint for OpenAI API
 *
 * Accepts requests from CloudProvider and forwards to OpenAI,
 * streaming the response back as SSE or returning a complete JSON response.
 */
app.post('/api/openai', async (req, res) => {
  try {
    const { model, messages, stream = true } = req.body;

    console.log(`[${new Date().toISOString()}] Request for model: ${model} (streaming: ${stream})`);

    // Validate required fields
    if (!model || !messages) {
      return res.status(400).json({
        error: 'Missing required fields: model and messages are required'
      });
    }

    // Build OpenAI request
    const openaiRequest = buildOpenAIRequest(req.body);
    console.log('openaiRequest', openaiRequest);

    // Create request to OpenAI
    const response = await openai.responses.create(openaiRequest);

    // Route to appropriate handler based on streaming mode
    if (stream) {
      await handleStreamingResponse(response, res);
    } else {
      // res.json({
      //   messages: response.output.filter(
      //     message => message.type === 'message' || message.type === 'function_call'
      //   ),
      // })
      res.json(response);
    }

  } catch (error) {
    handleProxyError(error, res);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'openai-proxy' });
});

app.listen(PORT, () => {
  console.log(`OpenAI proxy server running on port ${PORT}`);
  console.log(`Endpoint: http://localhost:${PORT}/api/openai`);
  console.log(`Health check: http://localhost:${PORT}/health`);

  if (!process.env.OPENAI_API_KEY) {
    console.warn('\n⚠️  WARNING: OPENAI_API_KEY not set in environment variables\n');
  }
});
