# Agentary JS

> A JavaScript SDK for running quantized small language models in the browser using WebGPU and WebAssembly, with built-in support for agentic workflows

[![npm version](https://img.shields.io/npm/v/agentary-js.svg)](https://www.npmjs.com/package/agentary-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

- **Browser-Native**: Run small language models directly in the browser without server dependencies
- **WebGPU Acceleration**: Leverage WebGPU for high-performance inference when available
- **Quantized Models**: Support for efficient quantized models (Q4, Q8, etc.) for optimal performance
- **Streaming Generation**: Real-time token streaming with Time to First Byte (TTFB) metrics
- **Function Calling**: Built-in support for tool/function calling capabilities
- **Multi-Model Support**: Use different models for chat, function calling, planning, and reasoning tasks
- **Agentic Workflows**: Create and execute complex multi-step agent workflows with conditional logic
- **Tool Integration**: Register custom tools for agents to use during workflow execution
- **Zero Server**: Complete client-side execution with no data leaving the user's device

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
    chat: 'onnx-community/gemma-3-270m-it-ONNX'
  },
  quantization: 'q4',
  engine: 'webgpu' // or 'wasm'
});

// Generate text with streaming
for await (const chunk of session.generate({ 
  prompt: 'Hello, how are you today?' 
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

### Function Calling

```javascript
import { createSession } from 'agentary-js';

const session = await createSession({
  models: {
    chat: 'onnx-community/gemma-3-270m-it-ONNX',
    function_calling: 'onnx-community/Qwen2.5-0.5B-Instruct'
  },
  quantization: 'q4'
});

const tools = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather for a city",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name" }
        },
        required: ["city"]
      }
    }
  }
];

for await (const chunk of session.generate({ 
  prompt: 'What is the weather in New York?',
  tools
})) {
  process.stdout.write(chunk.token);
}
```

### Agentic Workflows

Create sophisticated multi-step agent workflows that can think, reason, and take actions autonomously.

```javascript
import { createAgentSession } from 'agentary-js';

// Create an agent session with specialized models
const agent = await createAgentSession({
  models: {
    chat: 'onnx-community/gemma-3-270m-it-ONNX',
    function_calling: 'onnx-community/Qwen2.5-0.5B-Instruct',
    planning: 'onnx-community/gemma-3-270m-it-ONNX',
    reasoning: 'onnx-community/gemma-3-270m-it-ONNX'
  },
  quantization: 'q4'
});

// Define a research workflow
const researchWorkflow = {
  id: 'research-assistant',
  name: 'Research Assistant Workflow',
  description: 'Analyzes a topic and provides comprehensive insights',
  maxIterations: 5,
  timeout: 30000,
  steps: [
    {
      id: 'understand-topic',
      type: 'think',
      description: 'Understand and break down the research topic',
      nextSteps: ['gather-information']
    },
    {
      id: 'gather-information',
      type: 'act',
      description: 'Search for relevant information',
      tools: ['web_search'],
      nextSteps: ['analyze-findings']
    },
    {
      id: 'analyze-findings',
      type: 'think',
      description: 'Analyze gathered information for insights',
      nextSteps: ['provide-summary']
    },
    {
      id: 'provide-summary',
      type: 'respond',
      description: 'Provide a comprehensive summary and recommendations'
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
        implementation: async (query) => {
          // Your search implementation
          return `Search results for: ${query}`;
        }
      }
    }
  ]
};

// Execute the workflow
console.log('🤖 Starting research workflow...\n');

for await (const step of agent.runWorkflow(researchWorkflow)) {
  console.log(`[${step.type.toUpperCase()}] ${step.stepId}: ${step.content}`);
  
  if (step.toolCall) {
    console.log(`  🔧 Tool: ${step.toolCall.name}(${JSON.stringify(step.toolCall.args)})`);
    if (step.toolCall.result) {
      console.log(`  📄 Result: ${step.toolCall.result}`);
    }
  }
  
  if (step.error) {
    console.log(`  ❌ Error: ${step.error}`);
  }
  
  console.log(''); // Empty line for readability
}

await agent.dispose();
```

### Using Private Hugging Face Models

```javascript
const session = await createSession({
  models: {
    chat: 'your-org/private-model'
  },
  hfToken: 'hf_your_token_here',
  quantization: 'q4'
});
```

## 🏗️ API Reference

### `createSession(args: CreateSessionArgs): Promise<Session>`

Creates a new inference session with the specified configuration.

### `createAgentSession(args: CreateSessionArgs): Promise<AgentSession>`

Creates a new agent session with workflow capabilities, extending the basic session with agentic features.

#### CreateSessionArgs

| Property | Type | Description |
|----------|------|-------------|
| `models` | `object` | Model configuration for different tasks |
| `models.chat` | `string` | Model ID for chat/text generation |
| `models.function_calling` | `string` | Model ID for function calling tasks |
| `models.planning` | `string` | Model ID for planning tasks (optional) |
| `models.reasoning` | `string` | Model ID for reasoning tasks (optional) |
| `engine` | `'webgpu' \| 'wasm' \| 'auto'` | Inference engine (default: 'auto') |
| `quantization` | `'q4' \| 'q8' \| 'auto'` | Model quantization level |
| `hfToken` | `string` | Hugging Face token for private models |
| `ctx` | `number` | Context length override |

### `Session`

#### `generate(args: GenerateArgs): AsyncIterable<TokenStreamChunk>`

Generates text with streaming output.

##### GenerateArgs

| Property | Type | Description |
|----------|------|-------------|
| `prompt` | `string` | Input prompt for generation |
| `system` | `string` | System message (optional) |
| `tools` | `object[]` | Function calling tools (optional) |
| `temperature` | `number` | Sampling temperature (0.0-2.0) |
| `top_p` | `number` | Nucleus sampling parameter |
| `top_k` | `number` | Top-k sampling parameter |
| `repetition_penalty` | `number` | Repetition penalty (default: 1.1) |
| `stop` | `string[]` | Stop sequences |
| `seed` | `number` | Random seed for reproducible output |

##### TokenStreamChunk

| Property | Type | Description |
|----------|------|-------------|
| `token` | `string` | Generated token text |
| `tokenId` | `number` | Token ID |
| `isFirst` | `boolean` | Whether this is the first token |
| `isLast` | `boolean` | Whether this is the last token |
| `ttfbMs` | `number` | Time to first byte in milliseconds |

#### `dispose(): Promise<void>`

Cleans up the session and releases all resources.

### `AgentSession`

Extends `Session` with additional methods for workflow execution and tool management.

#### `runWorkflow(workflow: WorkflowDefinition): AsyncIterable<AgentStepResult>`

Executes a multi-step agent workflow with real-time step results.

#### `executeStep(step: WorkflowStep, context: Record<string, any>): AsyncIterable<AgentStepResult>`

Executes a single workflow step with the given context.

#### `registerTool(tool: Tool): void`

Registers a custom tool for use in workflows and generation.

#### `getRegisteredTools(): Tool[]`

Returns all currently registered tools.

#### AgentStepResult

| Property | Type | Description |
|----------|------|-------------|
| `stepId` | `string` | Unique identifier for the step |
| `type` | `'thinking' \| 'tool_call' \| 'decision' \| 'response' \| 'error'` | Type of step result |
| `content` | `string` | Generated content or result description |
| `isComplete` | `boolean` | Whether this step is finished |
| `toolCall` | `object` | Tool call information (if applicable) |
| `toolCall.name` | `string` | Name of the called tool |
| `toolCall.args` | `Record<string, any>` | Arguments passed to the tool |
| `toolCall.result` | `any` | Tool execution result |
| `nextStepId` | `string` | ID of the next step to execute |
| `error` | `string` | Error message (if step failed) |
| `metadata` | `Record<string, any>` | Additional step metadata |

#### WorkflowDefinition

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique workflow identifier |
| `name` | `string` | Human-readable workflow name |
| `description` | `string` | Workflow description |
| `steps` | `WorkflowStep[]` | Array of workflow steps |
| `tools` | `Tool[]` | Tools available to the workflow |
| `maxIterations` | `number` | Maximum number of steps to execute |
| `timeout` | `number` | Workflow timeout in milliseconds |

#### WorkflowStep

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique step identifier |
| `type` | `'think' \| 'act' \| 'decide' \| 'respond'` | Type of step |
| `description` | `string` | Step description/prompt |
| `tools` | `string[]` | Tools available for this step |
| `nextSteps` | `string[]` | Possible next step IDs |
| `maxRetries` | `number` | Maximum retry attempts |
| `condition` | `string` | Conditional logic for step execution |

#### Tool

| Property | Type | Description |
|----------|------|-------------|
| `type` | `'function'` | Tool type (currently only 'function') |
| `function` | `object` | Function definition |
| `function.name` | `string` | Function name |
| `function.description` | `string` | Function description |
| `function.parameters` | `Record<string, any>` | JSON Schema for parameters |
| `function.implementation` | `Function` | JavaScript implementation |

## 🌐 Browser Support

- **WebGPU**: Chrome 113+, Edge 113+, Firefox with WebGPU enabled
- **WebAssembly**: All modern browsers
- **Minimum Requirements**: 4GB RAM recommended for small models

## 🔧 Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/your-org/agentary-js.git
cd agentary-js

# Install dependencies
npm install

# Build the library
npm run build

# Watch for changes during development
npm run dev
```

### Project Structure

```
src/
├── index.ts                           # Main library exports
├── core/                             # Core session functionality
│   ├── session.ts                    # Basic session management
│   ├── agent-session.ts              # Agent workflow session
│   └── index.ts                      # Core exports
├── workers/                          # Worker management
│   ├── manager.ts                    # Worker lifecycle management
│   ├── worker.ts                     # Web Worker for model inference
│   └── index.ts                      # Worker exports
├── workflow/                         # Workflow execution engine
│   ├── executor.ts                   # Workflow execution logic
│   ├── step-executor.ts              # Individual step execution
│   ├── step-configs.ts               # Step type configurations
│   └── index.ts                      # Workflow exports
├── processing/                       # Content and tool processing
│   ├── content/
│   │   ├── processor.ts              # Content processing utilities
│   │   └── index.ts
│   ├── prompts/
│   │   ├── builder.ts                # Prompt construction
│   │   ├── templates.ts              # Prompt templates
│   │   └── index.ts
│   ├── tools/
│   │   ├── parser.ts                 # Main tool call parser
│   │   ├── parsers/
│   │   │   ├── xml-parser.ts         # XML format tool parser
│   │   │   ├── json-parser.ts        # JSON format tool parser
│   │   │   ├── function-parser.ts    # Function call parser
│   │   │   ├── composite-parser.ts   # Combined parsing strategy
│   │   │   └── index.ts
│   │   └── index.ts
│   └── index.ts                      # Processing exports
├── engine/                           # Main runtime engine
│   └── index.ts                      # Engine exports
├── types/
│   ├── api.ts                        # Public API types
│   └── worker.ts                     # Internal worker types
└── utils/
    ├── logger.ts                     # Logging utilities
    └── logger-config.ts              # Logger configuration
```

### Running the Examples

```bash
# Build the library
npm run build

# Serve the examples (requires a local server)
cd examples
npx http-server . -c-1

# Open examples in your browser:
# http://localhost:8080/chat/          - Basic chat example
# http://localhost:8080/agent/         - Agent workflow example
```

#### Available Examples

- **Chat Example** (`examples/chat/`): Basic text generation and function calling
- **Agent Example** (`examples/agent/`): Advanced agent workflows with multiple step types
  - Research Assistant workflow
  - Decision Making workflow  
  - Math Calculator workflow

## 🧠 Agent Workflow Patterns

### Step Types

Agent workflows support four main step types:

- **`think`**: Analysis, reasoning, and planning steps
- **`act`**: Action steps that use tools to interact with external systems
- **`decide`**: Decision-making steps with conditional logic
- **`respond`**: Final response or summary generation

### Common Workflow Patterns

#### Sequential Workflow
```javascript
const sequentialWorkflow = {
  steps: [
    { id: 'step1', type: 'think', nextSteps: ['step2'] },
    { id: 'step2', type: 'act', nextSteps: ['step3'] },
    { id: 'step3', type: 'respond' }
  ]
};
```

#### Conditional Workflow
```javascript
const conditionalWorkflow = {
  steps: [
    { id: 'analyze', type: 'think', nextSteps: ['simple', 'complex'] },
    { id: 'simple', type: 'respond', condition: 'simple_case' },
    { id: 'complex', type: 'act', condition: 'complex_case', nextSteps: ['respond'] },
    { id: 'respond', type: 'respond' }
  ]
};
```

#### Research & Analysis Pattern
```javascript
const researchPattern = {
  steps: [
    { id: 'plan', type: 'think', description: 'Plan research approach' },
    { id: 'gather', type: 'act', tools: ['search', 'fetch'] },
    { id: 'analyze', type: 'think', description: 'Analyze findings' },
    { id: 'synthesize', type: 'respond', description: 'Synthesize insights' }
  ]
};
```

### Best Practices

#### 1. Tool Design
- Keep tools focused and single-purpose
- Include comprehensive parameter schemas
- Handle errors gracefully in implementations
- Use descriptive names and descriptions

#### 2. Workflow Structure
- Limit workflows to 3-7 steps for optimal performance
- Use clear, descriptive step IDs and descriptions
- Set reasonable timeouts and iteration limits
- Plan for error scenarios

#### 3. Context Management
- Pass relevant context between steps
- Avoid overly long context that might exceed model limits
- Use structured data in step metadata

#### 4. Model Selection
- Use planning models for strategic, forward-thinking steps
- Use reasoning models for analysis and inference
- Use function calling models for tool-heavy workflows
- Consider using specialized models for domain-specific tasks

## 🔍 Logging & Debugging

Agentary.js includes a comprehensive logging system for debugging and monitoring your AI applications.

### Basic Logging Usage

```typescript
import { logger, LogLevel } from 'agentary-js';

// Use predefined category loggers
logger.session.info('Session created successfully');
logger.worker.debug('Processing generation request', { prompt: 'Hello' });
logger.agent.warn('Step timeout approaching', { stepId: 'step-1' });

// Or use custom categories
logger.info('custom-category', 'Custom message', { data: 'example' });
```

### Configuration

#### Environment-based Configuration

The logger automatically configures itself based on the environment:

- **Production**: WARN level, no colors, minimal context
- **Development**: DEBUG level, colors enabled, full context
- **Testing**: ERROR level only

#### Manual Configuration

```typescript
import { createLogger, LogLevel, LogConfigs } from 'agentary-js';

// Use a pre-defined config
const logger = createLogger(LogConfigs.debugging);

// Or create custom configuration
const logger = createLogger({
  level: LogLevel.INFO,
  enableColors: true,
  enableTimestamps: true,
  maxLogHistory: 500,
  customFormatters: {
    'my-category': (entry) => `🎯 ${entry.message}`
  }
});
```

#### Browser Configuration

Set log level via URL parameter or localStorage:

```javascript
// Via URL: http://localhost:3000?logLevel=debug
// Via localStorage:
localStorage.setItem('agentary_log_level', 'debug');

// Enable enhanced debugging mode
import { enableDebuggingMode } from 'agentary-js';
enableDebuggingMode();
```

#### Node.js Configuration

Set via environment variable:

```bash
AGENTARY_LOG_LEVEL=debug node your-app.js
```

### Log Levels

- **DEBUG**: Detailed information for debugging (worker init, step execution, etc.)
- **INFO**: General information (session creation, workflow completion)
- **WARN**: Warning conditions (timeouts, retries)
- **ERROR**: Error conditions (failures, exceptions)
- **SILENT**: No logging

### Structured Logging

All logs include structured data for better filtering and analysis:

```typescript
logger.worker.info('Generation completed', {
  model: 'gemma-3-270m',
  tokensGenerated: 156,
  duration: 1240
}, requestId);

// Outputs: [2024-01-15T10:30:45.123Z] [INFO] [worker] [req:abc123] Generation completed {"model":"gemma-3-270m","tokensGenerated":156,"duration":1240}
```

### Debug Features

#### Export Logs

```typescript
import { logger } from 'agentary-js';

// Get log history
const logs = logger.getLogHistory();

// Export as text
const logText = logger.exportLogs();
console.log(logText);

// Clear history
logger.clearHistory();
```

#### Custom Formatters

```typescript
import { createLogger } from 'agentary-js';

const logger = createLogger({
  customFormatters: {
    'performance': (entry) => {
      if (entry.data?.duration) {
        return `⚡ PERF: ${entry.message} (${entry.data.duration}ms)`;
      }
      return `⚡ PERF: ${entry.message}`;
    }
  }
});

logger.performance.info('Model loading completed', { duration: 2341 });
// Outputs: ⚡ PERF: Model loading completed (2341ms)
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
## 🙋‍♀️ Support

- 📖 [Documentation](https://github.com/your-org/agentary-js/wiki)
- 🐛 [Issue Tracker](https://github.com/your-org/agentary-js/issues)
- 💬 [Discussions](https://github.com/your-org/agentary-js/discussions)
