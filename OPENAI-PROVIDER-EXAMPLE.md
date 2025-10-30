# OpenAI Provider Usage Examples

The OpenAI provider enables you to use OpenAI's GPT models (and compatible APIs) alongside local WebGPU models in Agentary.

## Installation

The OpenAI SDK is included as a dependency. No additional installation required.

## Basic Usage

### Simple Text Generation

```javascript
import { createSession } from 'agentary-js';

const session = await createSession({
  provider: {
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini'
  }
});

// Stream responses
for await (const chunk of session.createResponse({
  messages: [
    { role: 'user', content: 'Explain quantum computing in simple terms' }
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

### With Generation Parameters

```javascript
const session = await createSession({
  provider: {
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o',
    maxRetries: 3
  }
});

for await (const chunk of session.createResponse({
  messages: [
    { role: 'system', content: 'You are a helpful coding assistant.' },
    { role: 'user', content: 'Write a function to reverse a string in Python' }
  ],
  temperature: 0.7,
  max_new_tokens: 500,
  top_p: 0.9
})) {
  if (!chunk.isLast) {
    process.stdout.write(chunk.token);
  }
}
```

## Tool Calling / Function Calling

The OpenAI provider supports native function calling:

```javascript
import { createAgentSession } from 'agentary-js';

const agent = await createAgentSession({
  provider: {
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o'
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
            enum: ['celsius', 'fahrenheit']
          }
        },
        required: ['location']
      },
      implementation: async ({ location, unit = 'fahrenheit' }) => {
        // Mock implementation
        return JSON.stringify({
          location,
          temperature: 72,
          unit,
          conditions: 'Sunny'
        });
      }
    }
  }
];

agent.registerTool(tools[0]);

// The agent will automatically call tools as needed
let response = '';
for await (const chunk of agent.createResponse({
  messages: [
    { role: 'user', content: 'What\'s the weather like in Boston?' }
  ],
  tools
}, 'tool_use')) {
  if (!chunk.isLast) {
    response += chunk.token;
  }
}

console.log(response);
```

## Token Usage Tracking

```javascript
import { createSession } from 'agentary-js';

const session = await createSession({
  provider: {
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini'
  }
});

// Listen for usage events
session.on('provider:request:complete', (event) => {
  if (event.usage) {
    console.log('Token usage:', {
      prompt: event.usage.prompt_tokens,
      completion: event.usage.completion_tokens,
      total: event.usage.total_tokens
    });

    // Calculate cost (example pricing)
    const inputCostPer1k = 0.00015; // $0.15 per 1M tokens
    const outputCostPer1k = 0.0006; // $0.60 per 1M tokens
    const cost = (
      (event.usage.prompt_tokens / 1000) * inputCostPer1k +
      (event.usage.completion_tokens / 1000) * outputCostPer1k
    );
    console.log(`Cost: $${cost.toFixed(6)}`);
  }
});

for await (const chunk of session.createResponse({
  messages: [{ role: 'user', content: 'Hello!' }]
})) {
  // Stream tokens...
}
```

## Using OpenAI-Compatible APIs

The provider works with OpenAI-compatible APIs (Groq, Together, etc.):

```javascript
// Groq example
const groqSession = await createSession({
  provider: {
    type: 'openai',
    apiKey: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
    baseURL: 'https://api.groq.com/openai/v1'
  }
});

// Together AI example
const togetherSession = await createSession({
  provider: {
    type: 'openai',
    apiKey: process.env.TOGETHER_API_KEY,
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    baseURL: 'https://api.together.xyz/v1'
  }
});
```

## Hybrid Workflows (Local + API)

Use different providers for different tasks:

```javascript
import { createAgentSession } from 'agentary-js';

const agent = await createAgentSession({
  providers: {
    // Use local model for simple chat
    chat: {
      type: 'local',
      model: {
        name: 'onnx-community/Qwen3-0.6B-ONNX',
        quantization: 'q4f16'
      }
    },
    // Use OpenAI for complex tool use
    tool_use: {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o-mini'
    },
    // Use OpenAI for reasoning
    reasoning: {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o'
    }
  }
});

// Define a workflow
const workflow = {
  id: 'hybrid-research',
  name: 'Hybrid Research Workflow',
  systemPrompt: 'You are a helpful research assistant.',
  steps: [
    {
      id: 'understand',
      prompt: 'Break down this topic into key questions',
      generationTask: 'chat', // Uses local model
      maxTokens: 200
    },
    {
      id: 'research',
      prompt: 'Search for information',
      toolChoice: ['web_search'],
      generationTask: 'tool_use' // Uses OpenAI
    },
    {
      id: 'analyze',
      prompt: 'Provide a detailed analysis',
      generationTask: 'reasoning', // Uses GPT-4o
      maxTokens: 1000
    }
  ],
  tools: [/* define your tools */],
  maxIterations: 5
};

for await (const iteration of agent.runWorkflow('Research climate change solutions', workflow)) {
  console.log(`Step: ${iteration.stepId}`, iteration.content);
}
```

## Error Handling

```javascript
const session = await createSession({
  provider: {
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
    maxRetries: 2
  }
});

// Handle rate limits
session.on('provider:rate_limit', (event) => {
  console.warn('Rate limited!', {
    provider: event.provider,
    retryAfter: event.retryAfter
  });
});

// Handle errors
session.on('provider:error', (event) => {
  console.error('Provider error:', event.error);
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
  } else if (error.status === 500) {
    console.error('OpenAI server error');
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Performance Monitoring

```javascript
const session = await createSession({
  provider: {
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini'
  }
});

let generationStartTime;

session.on('provider:request:start', (event) => {
  generationStartTime = event.timestamp;
  console.log(`Starting generation with ${event.model}`);
});

session.on('provider:request:complete', (event) => {
  const duration = event.duration;
  const tokensPerSecond = event.usage
    ? event.usage.completion_tokens / (duration / 1000)
    : 0;

  console.log({
    duration: `${duration}ms`,
    tokensPerSecond: tokensPerSecond.toFixed(2),
    usage: event.usage
  });
});

for await (const chunk of session.createResponse({
  messages: [{ role: 'user', content: 'Write a short poem' }]
})) {
  if (chunk.isFirst && chunk.ttfbMs) {
    console.log(`TTFB: ${chunk.ttfbMs}ms`);
  }
}
```

## Configuration Options

```typescript
interface OpenAIProviderConfig {
  type: 'openai';
  apiKey: string;                    // Required: Your OpenAI API key
  model: string;                     // Required: Model name (e.g., 'gpt-4o-mini')
  baseURL?: string;                  // Optional: Custom API endpoint
  organization?: string;             // Optional: OpenAI organization ID
  maxRetries?: number;               // Optional: Max retry attempts (default: 2)
}
```

## Supported Models

### OpenAI Models
- `gpt-4o` - Most capable model
- `gpt-4o-mini` - Fast and cost-effective
- `gpt-4-turbo` - Previous generation flagship
- `gpt-3.5-turbo` - Fast and economical

### Compatible APIs
- **Groq**: Ultra-fast inference
  - `llama-3.3-70b-versatile`
  - `mixtral-8x7b-32768`

- **Together AI**: Open-source models
  - `meta-llama/Llama-3.3-70B-Instruct-Turbo`
  - `mistralai/Mixtral-8x7B-Instruct-v0.1`

- **Anyscale**: Scalable inference
- **Fireworks AI**: Fast inference

## Next Steps

- See [Anthropic Provider Examples](./ANTHROPIC-PROVIDER-EXAMPLE.md) for Claude support
- Read the [full documentation](https://agentary-js.vercel.app) for more details
- Check out [workflow examples](./docs) for advanced use cases
