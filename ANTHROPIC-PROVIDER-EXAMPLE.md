# Anthropic Claude Provider Usage Examples

The Anthropic provider enables you to use Claude models alongside local WebGPU models and OpenAI models in Agentary.

## Features

- ✅ All Claude models (Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku, etc.)
- ✅ Streaming responses
- ✅ Tool/function calling
- ✅ Thinking mode (extended thinking for complex reasoning)
- ✅ Prompt caching (reduce costs for repeated contexts)
- ✅ Token usage tracking
- ✅ System prompt separation (Claude's native format)

## Installation

The OpenAI SDK is used for Anthropic compatibility. No additional installation required.

## Basic Usage

### Simple Text Generation

```javascript
import { createSession } from 'agentary-js';

const session = await createSession({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-5-sonnet-20241022'
  }
});

// Stream responses
for await (const chunk of session.createResponse({
  messages: [
    { role: 'user', content: 'Explain quantum entanglement in simple terms' }
  ]
})) {
  if (chunk.isFirst && chunk.ttfbMs) {
    console.log(`Time to first byte: ${chunk.ttfbMs}ms`);
  }
  if (!chunk.isLast) {
    process.stdout.write(chunk.token);
  }
}

await session.dispose();
```

### With System Prompt

```javascript
const session = await createSession({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-5-sonnet-20241022'
  }
});

for await (const chunk of session.createResponse({
  messages: [
    { role: 'system', content: 'You are a expert Python developer who writes clean, efficient code with comprehensive docstrings.' },
    { role: 'user', content: 'Write a function to calculate Fibonacci numbers using memoization' }
  ],
  temperature: 0.7,
  max_new_tokens: 1000
})) {
  if (!chunk.isLast) {
    process.stdout.write(chunk.token);
  }
}
```

## Claude-Specific Features

### Extended Thinking Mode

Claude can use "thinking" tokens to reason through complex problems before responding:

```javascript
const session = await createSession({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-5-sonnet-20241022'
  }
});

for await (const chunk of session.createResponse({
  messages: [
    { role: 'user', content: 'Solve this complex problem: A farmer has 100 feet of fence to enclose a rectangular garden. What dimensions maximize the area?' }
  ],
  enable_thinking: true,  // Enable extended thinking
  max_new_tokens: 2000
})) {
  // Note: Thinking tokens are not streamed to the user by default
  // They're used internally by Claude for reasoning
  if (!chunk.isLast) {
    process.stdout.write(chunk.token);
  }
}
```

### Prompt Caching (Cost Optimization)

Claude supports prompt caching to reduce costs when using the same context repeatedly:

```javascript
const session = await createSession({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-5-sonnet-20241022'
  }
});

// Listen for cache statistics
session.on('provider:request:complete', (event) => {
  if (event.usage) {
    console.log('Token usage:', {
      prompt: event.usage.prompt_tokens,
      completion: event.usage.completion_tokens,
      total: event.usage.total_tokens,
      // Claude-specific caching tokens
      cacheCreation: event.usage.cache_creation_tokens || 0,
      cacheRead: event.usage.cache_read_tokens || 0
    });
  }
});

// Large context that will be cached
const largeContext = `[Your large document or codebase here...]`;

for await (const chunk of session.createResponse({
  messages: [
    { role: 'system', content: largeContext },
    { role: 'user', content: 'Summarize the key points' }
  ]
})) {
  // Process response...
}

// Subsequent requests with the same context will use cache
for await (const chunk of session.createResponse({
  messages: [
    { role: 'system', content: largeContext },  // Cached!
    { role: 'user', content: 'What are the main themes?' }
  ]
})) {
  // Significantly cheaper due to cache hits
}
```

## Tool Calling / Function Calling

Claude has excellent native function calling support:

```javascript
import { createAgentSession } from 'agentary-js';

const agent = await createAgentSession({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-5-sonnet-20241022'
  }
});

// Define tools
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g. San Francisco, CA'
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description: 'Temperature unit'
          }
        },
        required: ['location']
      },
      implementation: async ({ location, unit = 'fahrenheit' }) => {
        // Your implementation
        return JSON.stringify({
          location,
          temperature: 72,
          unit,
          conditions: 'Sunny'
        });
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web for information',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query'
          }
        },
        required: ['query']
      },
      implementation: async ({ query }) => {
        // Your implementation
        return JSON.stringify({
          results: [
            { title: 'Result 1', snippet: 'Information...' }
          ]
        });
      }
    }
  }
];

tools.forEach(tool => agent.registerTool(tool));

// Claude will automatically use tools as needed
let response = '';
for await (const chunk of agent.createResponse({
  messages: [
    { role: 'user', content: 'What\'s the weather like in London and what are the latest news about it?' }
  ],
  tools
}, 'tool_use')) {
  if (!chunk.isLast) {
    response += chunk.token;
  }
}

console.log(response);
```

## Model Selection

### Available Claude Models

```javascript
// Claude 3.5 Sonnet (Best overall - recommended)
model: 'claude-3-5-sonnet-20241022'

// Claude 3 Opus (Most capable for complex tasks)
model: 'claude-3-opus-20240229'

// Claude 3 Haiku (Fastest and most cost-effective)
model: 'claude-3-haiku-20240307'

// Claude 3 Sonnet (Balanced)
model: 'claude-3-sonnet-20240229'
```

### Choosing the Right Model

```javascript
// For complex reasoning and analysis
const researchSession = await createSession({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-opus-20240229'  // Most capable
  }
});

// For general purpose tasks
const generalSession = await createSession({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-5-sonnet-20241022'  // Best balance
  }
});

// For high-volume, simple tasks
const fastSession = await createSession({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-haiku-20240307'  // Fastest & cheapest
  }
});
```

## Hybrid Workflows

### Mix Claude with Local and OpenAI Models

```javascript
import { createAgentSession } from 'agentary-js';

const agent = await createAgentSession({
  providers: {
    // Local model for simple chat
    chat: {
      type: 'local',
      model: {
        name: 'onnx-community/Qwen3-0.6B-ONNX',
        quantization: 'q4f16'
      }
    },
    // Claude for complex tool use
    tool_use: {
      type: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-5-sonnet-20241022'
    },
    // GPT-4 for reasoning
    reasoning: {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o'
    }
  }
});

const workflow = {
  id: 'multi-provider-research',
  name: 'Multi-Provider Research Workflow',
  systemPrompt: 'You are a thorough research assistant.',
  steps: [
    {
      id: 'initial-chat',
      prompt: 'Acknowledge the user request and outline the approach',
      generationTask: 'chat',  // Local model
      maxTokens: 100
    },
    {
      id: 'gather-info',
      prompt: 'Use tools to gather necessary information',
      toolChoice: ['search_web', 'get_data'],
      generationTask: 'tool_use',  // Claude
      maxTokens: 2000
    },
    {
      id: 'deep-analysis',
      prompt: 'Provide a comprehensive analysis with reasoning',
      generationTask: 'reasoning',  // GPT-4o
      maxTokens: 3000,
      enable_thinking: true
    }
  ],
  tools: [/* your tools */],
  maxIterations: 10
};

for await (const iteration of agent.runWorkflow('Research renewable energy trends', workflow)) {
  console.log(`[${iteration.stepId}]`, iteration.content);
}
```

## Cost Tracking

```javascript
const session = await createSession({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-5-sonnet-20241022'
  }
});

let totalCost = 0;

session.on('provider:request:complete', (event) => {
  if (event.usage) {
    // Claude 3.5 Sonnet pricing (as of Oct 2024)
    const inputCostPer1M = 3.00;   // $3 per 1M input tokens
    const outputCostPer1M = 15.00; // $15 per 1M output tokens
    const cacheCostPer1M = 0.30;   // $0.30 per 1M cache write tokens

    const inputCost = (event.usage.prompt_tokens / 1_000_000) * inputCostPer1M;
    const outputCost = (event.usage.completion_tokens / 1_000_000) * outputCostPer1M;
    const cacheCost = ((event.usage.cache_creation_tokens || 0) / 1_000_000) * cacheCostPer1M;

    // Cache reads are 90% cheaper
    const cacheReadCost = ((event.usage.cache_read_tokens || 0) / 1_000_000) * (inputCostPer1M * 0.1);

    const requestCost = inputCost + outputCost + cacheCost + cacheReadCost;
    totalCost += requestCost;

    console.log({
      tokens: event.usage,
      cost: {
        input: `$${inputCost.toFixed(6)}`,
        output: `$${outputCost.toFixed(6)}`,
        cache: `$${cacheCost.toFixed(6)}`,
        cacheRead: `$${cacheReadCost.toFixed(6)}`,
        total: `$${requestCost.toFixed(6)}`
      },
      runningTotal: `$${totalCost.toFixed(6)}`
    });
  }
});
```

## Error Handling

```javascript
const session = await createSession({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-5-sonnet-20241022',
    maxRetries: 2
  }
});

// Handle rate limits
session.on('provider:rate_limit', (event) => {
  console.warn('⚠️ Rate limited!', {
    provider: event.provider,
    retryAfter: event.retryAfter ? `${event.retryAfter}s` : 'unknown'
  });
});

// Handle errors
session.on('provider:error', (event) => {
  console.error('❌ Provider error:', event.error);
});

try {
  for await (const chunk of session.createResponse({
    messages: [{ role: 'user', content: 'Hello!' }]
  })) {
    // Process chunks...
  }
} catch (error) {
  if (error.status === 401) {
    console.error('Invalid API key');
  } else if (error.status === 429) {
    console.error('Rate limit exceeded');
  } else if (error.status === 529) {
    console.error('Claude is overloaded');
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Performance Comparison

### Claude vs GPT-4 vs Local

```javascript
async function benchmarkProviders(prompt) {
  const providers = [
    {
      name: 'Claude 3.5 Sonnet',
      config: { type: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-3-5-sonnet-20241022' }
    },
    {
      name: 'GPT-4o',
      config: { type: 'openai', apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o' }
    },
    {
      name: 'Local Qwen',
      config: { type: 'local', model: { name: 'onnx-community/Qwen3-0.6B-ONNX', quantization: 'q4f16' } }
    }
  ];

  for (const provider of providers) {
    const session = await createSession({ provider: provider.config });

    const startTime = Date.now();
    let ttfb;
    let tokenCount = 0;

    for await (const chunk of session.createResponse({
      messages: [{ role: 'user', content: prompt }]
    })) {
      if (chunk.isFirst && chunk.ttfbMs) {
        ttfb = chunk.ttfbMs;
      }
      if (!chunk.isLast) {
        tokenCount++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`${provider.name}:`, {
      ttfb: `${ttfb}ms`,
      duration: `${duration}ms`,
      tokens: tokenCount,
      tokensPerSecond: (tokenCount / (duration / 1000)).toFixed(2)
    });

    await session.dispose();
  }
}

await benchmarkProviders('Explain the theory of relativity');
```

## Configuration Options

```typescript
interface AnthropicProviderConfig {
  type: 'anthropic';
  apiKey: string;          // Required: Your Anthropic API key
  model: string;           // Required: Model name
  maxRetries?: number;     // Optional: Max retry attempts (default: 2)
}
```

## Best Practices

1. **Use prompt caching** for large contexts to reduce costs
2. **Enable thinking mode** for complex reasoning tasks
3. **Use Claude 3.5 Sonnet** as the default (best balance)
4. **Use Claude 3 Haiku** for simple, high-volume tasks
5. **Use Claude 3 Opus** for the most complex tasks
6. **Monitor token usage** to manage costs
7. **Implement rate limit handling** for production apps
8. **Use system prompts** to set consistent behavior

## Next Steps

- See [OpenAI Provider Examples](./OPENAI-PROVIDER-EXAMPLE.md) for GPT support
- Read the [full documentation](https://agentary-js.vercel.app) for more details
- Check out [workflow examples](./docs) for advanced use cases
