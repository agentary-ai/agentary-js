# Agentary JS

> A JavaScript SDK for running AI models on-device (WebGPU/WebAssembly) or via cloud providers (Anthropic, OpenAI), with built-in support for agentic workflows

[![npm version](https://img.shields.io/npm/v/agentary-js.svg)](https://www.npmjs.com/package/agentary-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

- **Flexible Inference** - Run models on-device in the browser OR securely via cloud providers
- **WebGPU Acceleration** - High-performance on-device inference using WebGPU when available
- **Cloud Provider Support** - Secure proxy pattern for Anthropic Claude and OpenAI models
- **Agentic Workflows** - Multi-step AI agents with tool calling, memory, and decision-making
- **Function/Tool Calling** - Built-in support with both on-device and cloud models
- **Memory Management** - Smart context compression with sliding-window or LLM summarization strategies
- **Multi-Provider Support** - Mix device and cloud models in the same application
- **Lifecycle Events** - Monitor inference, tool execution, and workflow progress
- **Streaming Generation** - Real-time token streaming with Time to First Byte (TTFB) metrics

## 📦 Installation

```bash
npm install agentary-js
```

## 🎯 Quick Start

### On-Device Inference

```javascript
import { createSession } from 'agentary-js';

// Create a session with on-device model
const session = await createSession({
  models: [{
    type: 'device',
    model: 'onnx-community/Qwen3-0.6B-ONNX',
    quantization: 'q4',
    engine: 'webgpu'
  }]
});

// Generate text with streaming
const response = await session.createResponse('onnx-community/Qwen3-0.6B-ONNX', {
  messages: [{ role: 'user', content: 'Hello, how are you today?' }],
  temperature: 0.7,
  max_new_tokens: 200
});

if (response.type === 'streaming') {
  for await (const chunk of response.stream) {
    if (chunk.isFirst && chunk.ttfbMs) {
      console.log(`Time to first byte: ${chunk.ttfbMs}ms`);
    }
    if (!chunk.isLast) {
      process.stdout.write(chunk.token);
    }
  }
}

// Clean up resources
await session.dispose();
```

### Cloud Provider Inference

```javascript
import { createSession } from 'agentary-js';

// Create a session with cloud provider (requires backend proxy)
const session = await createSession({
  models: [{
    type: 'cloud',
    model: 'claude-sonnet-4-5',
    proxyUrl: 'https://your-backend.com/api/anthropic',
    modelProvider: 'anthropic'
  }]
});

// Generate text (streaming or non-streaming)
const response = await session.createResponse('claude-sonnet-4-5', {
  messages: [{ role: 'user', content: 'Explain quantum computing briefly' }],
  max_tokens: 300
});

if (response.type === 'complete') {
  console.log(response.content);
}

await session.dispose();
```

### Tool Calling

```javascript
import { createSession } from 'agentary-js';

const session = await createSession({
  models: [{
    type: 'cloud',
    model: 'claude-sonnet-4-5',
    proxyUrl: 'https://your-backend.com/api/anthropic',
    modelProvider: 'anthropic'
  }]
});

// Define tools
const tools = [
  {
    name: 'get_weather',
    description: 'Get the current weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name' }
      },
      required: ['location']
    },
    implementation: async ({ location }) => {
      // Your weather API implementation
      return `Weather in ${location}: 72°F, Sunny`;
    }
  }
];

const response = await session.createResponse('claude-sonnet-4-5', {
  messages: [{ role: 'user', content: 'What is the weather in San Francisco?' }],
  tools,
  tool_choice: 'auto'
});

// Handle tool calls and responses
if (response.type === 'complete' && response.toolCalls) {
  for (const toolCall of response.toolCalls) {
    const tool = tools.find(t => t.name === toolCall.name);
    const result = await tool.implementation(toolCall.arguments);
    console.log(`Tool ${toolCall.name} result:`, result);
  }
}

await session.dispose();
```

### Agentic Workflows

```javascript
import { createAgentSession } from 'agentary-js';

const agent = await createAgentSession({
  models: [{
    type: 'device',
    model: 'onnx-community/Qwen3-0.6B-ONNX',
    quantization: 'q4',
    engine: 'webgpu'
  }]
});

const workflow = {
  id: 'research-assistant',
  name: 'Research Assistant',
  systemPrompt: 'You are a helpful research assistant.',
  maxIterations: 5,
  steps: [
    {
      id: 'understand',
      prompt: 'Break down the research topic',
      model: 'onnx-community/Qwen3-0.6B-ONNX',
      maxTokens: 200
    },
    {
      id: 'research',
      prompt: 'Search for relevant information',
      model: 'onnx-community/Qwen3-0.6B-ONNX',
      toolChoice: ['web_search'],
      maxTokens: 300
    },
    {
      id: 'synthesize',
      prompt: 'Provide a comprehensive summary',
      model: 'onnx-community/Qwen3-0.6B-ONNX',
      maxTokens: 400
    }
  ],
  tools: [
    {
      definition: {
        name: 'web_search',
        description: 'Search the web for information',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        },
      },
      implementation: async ({ query }) => {
        // Your search implementation
        return `Search results for: ${query}`;
      }
    }
  ]
};

// Run workflow with memory management
for await (const iteration of agent.runWorkflow(
  'Research the benefits of renewable energy',
  workflow,
  {
    strategy: 'sliding-window',
    maxMessages: 10
  }
)) {
  if (iteration?.content) {
    console.log(`[Step ${iteration.stepId}]: ${iteration.content}`);
  }
}

await agent.dispose();
```

## 📚 Documentation

**[Full Documentation →](https://docs.agentary.ai)**

### Getting Started
- [Installation](https://docs.agentary.ai/getting-started/installation)
- [Quick Start Guide](https://docs.agentary.ai/getting-started/quick-start)
- [Core Concepts](https://docs.agentary.ai/getting-started/concepts)

### Guides
- [Cloud Provider Setup](https://docs.agentary.ai/guides/cloud-provider)
- [Tool Calling](https://docs.agentary.ai/guides/tool-calling)
- [Agentic Workflows](https://docs.agentary.ai/guides/agentic-workflows)

### API Reference
- [Session API](https://docs.agentary.ai/api-reference/session)
- [Agent Session API](https://docs.agentary.ai/api-reference/agent-session)
- [Memory Management](https://docs.agentary.ai/api-reference/memory)

### Additional Resources
- [Supported Models](https://github.com/agentary-ai/agentary-js/blob/main/docs/MODEL-SUPPORT.md)

## 🌐 Browser Support

### On-Device Models
- **WebGPU**: Chrome 113+, Edge 113+, Firefox (with WebGPU enabled), Safari 26+
- **WebAssembly**: All modern browsers (fallback when WebGPU unavailable)
- **Minimum Requirements**: 4GB RAM recommended for small models

### Cloud Provider Models
- Works in any environment that can make HTTP requests (browser, Node.js, etc.)
- Requires backend proxy server for secure API key management

## 🔧 Development

```bash
# Clone the repository
git clone https://github.com/agentary-ai/agentary-js.git
cd agentary-js

# Install dependencies
npm install

# Build the library
npm run build

# Watch for changes during development
npm run dev

# Run tests
npm test
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♀️ Support

- 📖 [Documentation](https://docs.agentary.ai)
- 🐛 [Issue Tracker](https://github.com/agentary-ai/agentary-js/issues)
- 💬 [Discussions](https://github.com/agentary-ai/agentary-js/discussions)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](.github/CONTRIBUTING.md) for details.
