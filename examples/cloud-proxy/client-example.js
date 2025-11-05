/**
 * Example client usage of Agentary JS with cloud proxy
 *
 * This demonstrates how to use the CloudProvider with the proxy servers.
 *
 * Prerequisites:
 *   1. Start the proxy server (anthropic-proxy.js or openai-proxy.js)
 *   2. Install agentary-js in your project: npm install agentary-js
 *   3. Run this example: node client-example.js
 */

import { createSession } from 'agentary-js';

async function exampleAnthropicChat() {
  console.log('\n=== Anthropic Claude Example ===\n');

  try {
    // Create session with Anthropic cloud provider
    const session = await createSession({
      models: [
        {
          type: 'cloud',
          proxyUrl: 'http://localhost:3001/api/anthropic',
          model: 'claude-3-5-sonnet-20241022',
          timeout: 30000,
          maxRetries: 3,
        }
      ]
    });

    console.log('Sending message to Claude...\n');

    let fullResponse = '';
    let tokenCount = 0;

    // Stream the response
    for await (const chunk of session.createResponse({
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'user', content: 'Write a haiku about coding' }
      ],
      max_tokens: 100,
      temperature: 0.7
    })) {
      process.stdout.write(chunk.token);
      fullResponse += chunk.token;
      tokenCount++;

      // Log TTFB for first token
      if (chunk.isFirst && chunk.ttfbMs) {
        console.log(`\n[TTFB: ${chunk.ttfbMs}ms]`);
      }
    }

    console.log(`\n\nTokens: ${tokenCount}`);
    console.log('Response completed!\n');

    // Clean up
    await session.dispose();

  } catch (error) {
    console.error('Error:', error.message);
    if (error.statusCode) {
      console.error('Status Code:', error.statusCode);
    }
  }
}

async function exampleOpenAIChat() {
  console.log('\n=== OpenAI GPT-4 Example ===\n');

  try {
    // Create session with OpenAI cloud provider
    const session = await createSession({
      models: [
        {
          type: 'cloud',
          proxyUrl: 'http://localhost:3002/api/openai',
          model: 'gpt-4o',
          timeout: 30000,
          maxRetries: 3,
        }
      ]
    });

    console.log('Sending message to GPT-4...\n');

    let fullResponse = '';
    let tokenCount = 0;

    // Stream the response
    for await (const chunk of session.createResponse({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Explain quantum computing in one sentence' }
      ],
      max_tokens: 100,
      temperature: 0.7
    })) {
      process.stdout.write(chunk.token);
      fullResponse += chunk.token;
      tokenCount++;

      // Log TTFB for first token
      if (chunk.isFirst && chunk.ttfbMs) {
        console.log(`\n[TTFB: ${chunk.ttfbMs}ms]`);
      }
    }

    console.log(`\n\nTokens: ${tokenCount}`);
    console.log('Response completed!\n');

    // Clean up
    await session.dispose();

  } catch (error) {
    console.error('Error:', error.message);
    if (error.statusCode) {
      console.error('Status Code:', error.statusCode);
    }
  }
}

async function exampleMultipleProviders() {
  console.log('\n=== Multiple Providers Example ===\n');

  try {
    // Create session with multiple cloud providers
    const session = await createSession({
      models: [
        {
          type: 'cloud',
          proxyUrl: 'http://localhost:3001/api/anthropic',
          model: 'claude-3-5-sonnet-20241022',
        },
        {
          type: 'cloud',
          proxyUrl: 'http://localhost:3002/api/openai',
          model: 'gpt-4o',
        }
      ]
    });

    console.log('Asking the same question to both models...\n');

    const question = 'What is the meaning of life?';

    // Ask Claude
    console.log('Claude says:');
    for await (const chunk of session.createResponse({
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: question }],
      max_tokens: 50
    })) {
      process.stdout.write(chunk.token);
    }

    console.log('\n');

    // Ask GPT-4
    console.log('GPT-4 says:');
    for await (const chunk of session.createResponse({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: question }],
      max_tokens: 50
    })) {
      process.stdout.write(chunk.token);
    }

    console.log('\n\nBoth responses completed!\n');

    // Clean up
    await session.dispose();

  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function exampleWithCustomHeaders() {
  console.log('\n=== Custom Headers Example ===\n');

  try {
    // Create session with custom headers (e.g., for authentication)
    const session = await createSession({
      models: [
        {
          type: 'cloud',
          proxyUrl: 'http://localhost:3001/api/anthropic',
          model: 'claude-3-5-sonnet-20241022',
          headers: {
            'X-User-ID': 'user-123',
            'X-Request-ID': `req-${Date.now()}`,
            // Add authentication if your proxy requires it
            // 'Authorization': 'Bearer your-token'
          },
        }
      ]
    });

    console.log('Sending message with custom headers...\n');

    for await (const chunk of session.createResponse({
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'user', content: 'Say hello!' }
      ],
      max_tokens: 50
    })) {
      process.stdout.write(chunk.token);
    }

    console.log('\n\nResponse completed!\n');

    await session.dispose();

  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function exampleErrorHandling() {
  console.log('\n=== Error Handling Example ===\n');

  try {
    const session = await createSession({
      models: [
        {
          type: 'cloud',
          proxyUrl: 'http://localhost:3001/api/anthropic',
          model: 'claude-3-5-sonnet-20241022',
          timeout: 5000, // Short timeout for demo
          maxRetries: 2,
        }
      ]
    });

    console.log('Testing error handling...\n');

    for await (const chunk of session.createResponse({
      model: 'invalid-model-name', // This will cause an error
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    })) {
      process.stdout.write(chunk.token);
    }

  } catch (error) {
    console.log('✓ Error caught successfully!\n');
    console.log('Error type:', error.constructor.name);
    console.log('Message:', error.message);
    if (error.statusCode) {
      console.log('Status code:', error.statusCode);
    }
  }
}

// Main function to run all examples
async function main() {
  const args = process.argv.slice(2);
  const example = args[0] || 'all';

  console.log('====================================');
  console.log('Agentary JS Cloud Provider Examples');
  console.log('====================================');

  // Check which examples to run
  if (example === 'all' || example === 'anthropic') {
    await exampleAnthropicChat();
  }

  if (example === 'all' || example === 'openai') {
    await exampleOpenAIChat();
  }

  if (example === 'all' || example === 'multiple') {
    await exampleMultipleProviders();
  }

  if (example === 'all' || example === 'headers') {
    await exampleWithCustomHeaders();
  }

  if (example === 'all' || example === 'errors') {
    await exampleErrorHandling();
  }

  console.log('All examples completed!');
}

// Run examples
main().catch(console.error);

/**
 * Usage:
 *
 * Run all examples:
 *   node client-example.js
 *
 * Run specific example:
 *   node client-example.js anthropic
 *   node client-example.js openai
 *   node client-example.js multiple
 *   node client-example.js headers
 *   node client-example.js errors
 */
