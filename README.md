# Agentary JS

> A JavaScript SDK for running quantized small language models in the browser using WebGPU and WebAssembly, with built-in support for agentic workflows

[![npm version](https://img.shields.io/npm/v/agentary-js.svg)](https://www.npmjs.com/package/agentary-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

- **Browser-Native** - Run small language models directly in the browser without server dependencies
- **WebGPU Acceleration** - Leverage WebGPU for high-performance inference when available
- **Agentic Workflows** - Create and execute complex multi-step agent workflows with conditional logic
- **Function Calling** - Built-in support for tool/function calling capabilities
- **Multi-Model Support** - Use different models for chat, tool use and reasoning
- **Memory Management** - Smart context compression and pruning for long conversations
- **Streaming Generation** - Real-time token streaming with Time to First Byte (TTFB) metrics

## 📦 Installation

```bash
npm install agentary-js
```

## 🎯 Quick Start

### Basic Text Generation

```javascript
import { createSession } from 'agentary-js';

// Create a session with a quantized model
const session = await createSession({
  models: {
    chat: {
      name: 'onnx-community/gemma-3-270m-it-ONNX',
      quantization: 'q4'
    }
  },
  engine: 'webgpu' // or 'wasm'
});

// Generate text with streaming
for await (const chunk of session.createResponse({
  messages: [{ role: 'user', content: 'Hello, how are you today?' }]
})) {
  if (chunk.isFirst && chunk.ttfbMs) {
    console.log(`Time to first byte: ${chunk.ttfbMs}ms`);
  }
  if (!chunk.isLast) {
    process.stdout.write(chunk.token);
  }
}

// Clean up resources
await session.dispose();
```

### Agentic Workflows

```javascript
import { createAgentSession } from 'agentary-js';

const agent = await createAgentSession({
  models: {
    chat: {
      name: 'onnx-community/gemma-3-270m-it-ONNX',
      quantization: 'q4'
    },
    tool_use: {
      name: 'onnx-community/Qwen2.5-0.5B-Instruct',
      quantization: 'q4'
    }
  }
});

const workflow = {
  id: 'research-assistant',
  name: 'Research Assistant Workflow',
  systemPrompt: 'You are a helpful research assistant.',
  maxIterations: 5,
  steps: [
    {
      id: 'understand',
      prompt: 'Break down the research topic',
      maxTokens: 200,
      generationTask: 'reasoning'
    },
    {
      id: 'research',
      prompt: 'Search for relevant information',
      toolChoice: ['web_search'],
      generationTask: 'tool_use'
    },
    {
      id: 'synthesize',
      prompt: 'Provide a comprehensive summary',
      maxTokens: 400,
      generationTask: 'chat'
    }
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web for information',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        },
        implementation: async ({ query }) => {
          // Your search implementation
          return `Search results for: ${query}`;
        }
      }
    }
  ]
};

for await (const iteration of agent.runWorkflow(
  'Research the benefits of renewable energy',
  workflow
)) {
  if (iteration?.content) {
    console.log(`[Step ${iteration.stepId}]: ${iteration.content}`);
  }
}

await agent.dispose();
```

## 📚 Documentation

**[Full Documentation →](https://docs.agentary.ai)**

- [Getting Started](https://docs.agentary.ai/getting-started/installation)
- [Quick Start Guide](https://docs.agentary.ai/getting-started/quick-start)
- [Tool Calling](https://docs.agentary.ai/guides/tool-calling)
- [Agentic Workflows](https://docs.agentary.ai/guides/agentic-workflows)
- [Memory Management](https://docs.agentary.ai/guides/memory-management)
- [API Reference](https://docs.agentary.ai/api/session)

## 🌐 Browser Support

- **WebGPU**: Chrome 113+, Edge 113+, Firefox with WebGPU enabled
- **WebAssembly**: All modern browsers
- **Minimum Requirements**: 4GB RAM recommended for small models

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
