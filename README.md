# Agentary JS

> **A lightweight JavaScript SDK for building agentic workflows with tool calling, memory, and multi-step reasoning.**

[![npm version](https://img.shields.io/npm/v/agentary-js.svg)](https://www.npmjs.com/package/agentary-js)  
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🚀 Features

### 🤖 **Agentic Workflows (Core Value)**
Multi-step agents with reasoning, tool execution, memory, and decision logic.

### 🔧 **Tool Calling**
Typed function calling with automatic execution, supported on cloud and device.

### 🧠 **Smart Memory**
Sliding window, LLM summarization, or checkpoint-based memory for long-running agents.

### ☁️ **Cloud + 🖥️ Device Runtime (Flexible Execution)**
Use Claude/OpenAI for advanced reasoning, or run models locally using [Transformers.js](https://github.com/huggingface/transformers.js).

### 📡 **Unified API**
Same function calls for device and cloud models. No vendor lock-in, no rewriting code.

### 📊 **Observable Runtime**
Lifecycle events for streaming tokens, workflow steps, tool calls, and model routing.

### ⚡ **Lightweight & Type-Safe**
Tree-shakeable, minimal abstraction, full TypeScript IntelliSense.

---

## 📦 Installation

### For Cloud-Only Usage

```bash
npm install agentary-js
```

### For Device (Local) Inference

If you plan to run models locally using Transformers.js, install the peer dependency:

```bash
npm install agentary-js @huggingface/transformers
```

> **Note:** `@huggingface/transformers` is only required for on-device inference. Cloud-only users can skip this dependency.

---

## 🎯 Quick Start

Below are the **three primary ways developers use Agentary**.

---

# 1. Agentic Workflow (Recommended)

```javascript
import { createAgentSession } from 'agentary-js';

const agent = await createAgentSession({
  models: [{
    runtime: 'anthropic',
    model: 'claude-sonnet-4-5',
    proxyUrl: '/api/anthropic',
    modelProvider: 'anthropic'
  }]
});

const workflow = {
  id: 'research',
  name: 'Research Assistant',
  maxIterations: 5,
  steps: [
    { id: 'understand', prompt: 'Break the topic down.' },
    { 
      id: 'research', 
      prompt: 'Search for relevant information.',
      toolChoice: ['web_search'] 
    },
    { id: 'synthesize', prompt: 'Summarize your findings clearly.' }
  ],
  tools: [
    {
      definition: {
        name: 'web_search',
        description: 'Search the web for information',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query']
        }
      },
      implementation: async ({ query }) =>
        `Search results for: ${query}`
    }
  ]
};

for await (const step of agent.runWorkflow(
  'Explain the benefits of renewable energy.',
  workflow,
  { strategy: 'sliding-window', maxMessages: 10 }
)) {
  console.log(`[${step.stepId}]`, step.content);
}
```

---

# 2. Cloud Provider Inference (OpenAI / Anthropic)

```javascript
import { createSession } from 'agentary-js';

const session = await createSession({
  models: [{
    runtime: 'anthropic',
    model: 'claude-sonnet-4-5',
    proxyUrl: '/api/anthropic',
    modelProvider: 'anthropic'
  }]
});

const res = await session.createResponse('claude-sonnet-4-5', {
  messages: [{ role: 'user', content: 'Explain quantum computing.' }],
  max_tokens: 300
});

console.log(res.type === 'complete' ? res.content : '');
await session.dispose();
```

---

# 3. On-Device Inference (Transformers.js Runtime)

```javascript
import { createSession } from 'agentary-js';

const session = await createSession({
  models: [{
    runtime: 'transformers-js',
    model: 'onnx-community/Qwen3-0.6B-ONNX',
    quantization: 'q4',
    engine: 'webgpu'
  }]
});

const out = await session.createResponse('onnx-community/Qwen3-0.6B-ONNX', {
  messages: [{ role: 'user', content: 'Hello!' }]
});

if (out.type === 'streaming') {
  for await (const chunk of out.stream) {
    process.stdout.write(chunk.token);
  }
}

await session.dispose();
```

---

## 🔧 Tool Calling

```javascript
const tools = [
  {
    name: 'get_weather',
    description: 'Get weather for a city',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string' }
      },
      required: ['location']
    },
    implementation: async ({ location }) =>
      `Weather in ${location}: 72°F, Sunny`
  }
];
```

Agentary handles:
- parsing model tool calls  
- resolving arguments  
- executing tools  
- inserting results back into context  

---

# 🧠 Why Agentary?

## When to Use Agentary

| Use Case | Recommendation |
|----------|----------------|
| Build multi-step agents with tools, memory, decision logic | **Agentary** |
| Unified cloud + device execution | **Agentary** |
| Easiest workflow engine in JS | **Agentary** |
| Only need raw on-device inference | Use **Transformers.js** directly |
| Only calling OpenAI/Anthropic APIs | Agentary **or** Vercel AI SDK |
| Large enterprise-style orchestration | Agentary **or** LangChain.js |

Agentary is **not** an inference library.  
It is a **workflow framework** built on best-in-class runtimes.

---

# 📚 Documentation

📖 https://docs.agentary.ai

- Getting Started  
- Tool Calling  
- Cloud Providers  
- Agentic Workflows  
- Memory Management  
- Supported Models  
- API Reference  

---

# 🌐 Runtime Support

## On-Device (Transformers.js)
- WebGPU: Chrome 113+, Edge 113+, Safari 26+, Firefox (flag)
- WASM fallback
- 4GB RAM recommended for small models

## Cloud Providers
Works in:
- Browsers  
- Node.js  
- Serverless / Edge functions  

Requires a secure backend proxy for API keys.

---

# 🔧 Development

```bash
git clone https://github.com/agentary-ai/agentary-js.git
cd agentary-js
npm install
npm run build
npm run dev
npm test
```

---

# 📄 License

MIT License.

---

# 🙋‍♀️ Support
- Documentation  
- GitHub Issues  
- Discussions  

---

# 🤝 Contributing
See `.github/CONTRIBUTING.md`.