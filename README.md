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
- **Multi-Model Support**: Use different models for chat, tool use and reasoning.
- **Agentic Workflows**: Create and execute complex multi-step agent workflows with conditional logic
- **Tool Integration**: Register custom tools for agents to use during workflow execution

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

### Tool Calling

```javascript
import { createSession } from 'agentary-js';

const session = await createSession({
  models: {
    chat: {
      name: 'onnx-community/gemma-3-270m-it-ONNX',
      quantization: 'q4'
    },
    tool_use: {
      name: 'onnx-community/gemma-3-270m-it-ONNX',
      quantization: 'q4'
    }
  }
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

for await (const chunk of session.createResponse({ 
  messages: [{ role: 'user', content: 'What is the weather in New York?' }],
  tools
})) {
  process.stdout.write(chunk.token);
}
```

### Agentic Workflows

Create multi-step agent workflows that can think, reason, and take actions autonomously.

```javascript
import { createAgentSession } from 'agentary-js';

// Create an agent session with specialized models
const agent = await createAgentSession({
  models: {
    chat: {
      name: 'onnx-community/gemma-3-270m-it-ONNX',
      quantization: 'q4'
    },
    tool_use: {
      name: 'onnx-community/Qwen2.5-0.5B-Instruct',
      quantization: 'q4'
    },
    default: {
      name: 'onnx-community/Qwen2.5-0.5B-Instruct',
      quantization: 'q4'
    }
  },
});

// Define a research workflow
const researchWorkflow = {
  id: 'research-assistant',
  name: 'Research Assistant Workflow',
  systemPrompt: 'You are a helpful research assistant.',
  maxIterations: 5,
  timeout: 30000,
  memoryConfig: {
    enablePruning: true
  }
  steps: [
    {
      id: 1,
      prompt: 'Understand and break down the research topic',
      maxTokens: 200,
      temperature: 0.7,
      generationTask: 'reasoning'
    },
    {
      id: 2,
      prompt: 'Search for relevant information using available tools',
      toolChoice: ['web_search'],
      maxTokens: 300,
      generationTask: 'tool_use'
    },
    {
      id: 3,
      prompt: 'Analyze the gathered information for insights',
      maxTokens: 400,
      temperature: 0.8,
      generationTask: 'reasoning'
    },
    {
      id: 4,
      prompt: 'Provide a comprehensive summary and recommendations',
      maxTokens: 500,
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

for await (const iteration of agent.runWorkflow('Research the benefits of renewable energy', researchWorkflow)) {
  if (iteration?.content) {
    console.log(`[Step ${iteration.stepId}]: ${iteration?.content}`);

  }
  if (iteration?.toolCall) {
    console.log(`  🔧 Tool: ${iteration.toolCall.name}(${JSON.stringify(iteration.toolCall.args)})`);
    if (iteration.toolCall.result) {
      console.log(`  📄 Result: ${iteration.toolCall.result}`);
    }
  }
  
  if (iteration?.error) {
    console.log(`  ❌ Error: ${iteration.error.message}`);
  }
  
  console.log(''); // Empty line for readability
}

await agent.dispose();
```

## 🏗️ API Reference

### `createSession(args: CreateSessionArgs): Promise<Session>`

Creates a new inference session with the specified configuration.

### `createAgentSession(args: CreateSessionArgs): Promise<AgentSession>`

Creates a new agent session with workflow capabilities, extending the basic session with agentic features.

#### CreateSessionArgs

| Property | Type | Description |
|----------|------|-------------|
| `models` | `object` | Model configuration for different tasks (optional) |
| `models.default` | `Model` | Default model configuration (optional) |
| `models.tool_use` | `Model` | Model for tool/function calling |
| `models.chat` | `Model` | Model for chat/text generation |
| `models.reasoning` | `Model` | Model for reasoning tasks |
| `engine` | `DeviceType` | Inference engine - 'auto', 'webgpu', 'wasm', 'webnn' (optional) |
| `hfToken` | `string` | Hugging Face token for private models (optional) |
| `ctx` | `number` | Context length override (optional) |

### `Session`

#### `createResponse(args: GenerateArgs, generationTask?: GenerationTask): AsyncIterable<TokenStreamChunk>`

Generates text with streaming output using the specified generation task.

##### GenerateArgs

| Property | Type | Description |
|----------|------|-------------|
| `messages` | `Message[]` | Array of conversation messages |
| `model` | `Model` | Override model for this generation (optional) |
| `max_new_tokens` | `number` | Maximum number of tokens to generate |
| `tools` | `Tool[]` | Function calling tools (optional) |
| `temperature` | `number` | Sampling temperature (0.0-2.0) |
| `top_p` | `number` | Nucleus sampling parameter |
| `top_k` | `number` | Top-k sampling parameter |
| `repetition_penalty` | `number` | Repetition penalty (default: 1.1) |
| `stop` | `string[]` | Stop sequences |
| `seed` | `number` | Random seed for reproducible output |
| `deterministic` | `boolean` | Use deterministic generation |


##### GenerationTask

Generation task: `'chat' \| 'tool_use' \| 'reasoning'`

##### Message

| Property | Type | Description |
|----------|------|-------------|
| `role` | `'user' \| 'assistant' \| 'system'` | Role of the message sender |
| `content` | `string` | The message content |

##### Model

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Model identifier (e.g., HuggingFace model name) |
| `quantization` | `DataType` | Model quantization level |

##### TokenStreamChunk

| Property | Type | Description |
|----------|------|-------------|
| `token` | `string` | Generated token text |
| `tokenId` | `number` | Token ID |
| `isFirst` | `boolean` | Whether this is the first token |
| `isLast` | `boolean` | Whether this is the last token |
| `ttfbMs` | `number` | Time to first byte in milliseconds (optional) |
| `tokensPerSecond` | `number` | Tokens per second rate (optional) |

#### `dispose(): Promise<void>`

Cleans up the session and releases all resources.

### `AgentSession`

Extends `Session` with additional methods for workflow execution and tool management.

#### `runWorkflow(prompt: string, workflow: AgentWorkflow): AsyncIterable<WorkflowStep>`

Executes a multi-step agent workflow with the given prompt and workflow definition.

#### `registerTool(tool: Tool): void`

Registers a custom tool for use in workflows and generation.

#### `getRegisteredTools(): Tool[]`

Returns all currently registered tools.

#### WorkflowStep

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique identifier for the step |
| `description` | `string` | Short description of the step for persistent agent memory |
| `prompt` | `string` | The prompt or instruction for this step |
| `maxTokens` | `number` | Maximum tokens to generate (optional) |
| `temperature` | `number` | Temperature for generation (optional) |
| `generationTask` | `GenerationTask` | Type of generation task (optional) |
| `toolChoice` | `string[]` | Available tools for this step (optional) |
| `maxAttempts` | `number` | Maximum retry attempts on failure (optional, default: 1) |

#### WorkflowIterationResponse

| Property | Type | Description |
|----------|------|-------------|
| `stepId` | `string` | ID of the workflow step (optional) |
| `error` | `WorkflowStepError` | Error details if step failed (optional) |
| `content` | `string` | Generated content (optional) |
| `toolCall` | `object` | Tool call information (optional) |
| `toolCall.name` | `string` | Name of the called tool (optional) |
| `toolCall.args` | `Record<string, any>` | Arguments passed to the tool (optional) |
| `toolCall.result` | `string` | Tool execution result (optional) |
| `metadata` | `Record<string, any>` | Additional step metadata (optional) |

#### WorkflowStepError

| Property | Type | Description |
|----------|------|-------------|
| `message` | `string` | Error message describing the step failure |


#### AgentWorkflow

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique workflow identifier |
| `name` | `string` | Human-readable workflow name |
| `description` | `string` | Workflow description (optional) |
| `systemPrompt` | `string` | System prompt for the workflow (optional) |
| `steps` | `WorkflowStep[]` | Array of workflow steps |
| `context` | `Record<string, any>` | Initial workflow context data (optional) |
| `tools` | `Tool[]` | Tools available to the workflow |
| `timeout` | `number` | Workflow timeout in milliseconds (optional) |
| `maxIterations` | `number` | Maximum number of iterations (optional) |
| `memoryConfig` | `AgentMemoryConfig` | Memory management configuration (optional) |

#### AgentMemoryConfig

| Property | Type | Description |
|----------|------|-------------|
| `enableMessageSummarization` | `boolean` | Enable automatic summarization of old messages (optional, default: false) |
| `enableMessagePruning` | `boolean` | Enable automatic pruning of old messages when token limit is reached (optional, default: false) |
| `enableMessageHistory` | `boolean` | Enable full message history tracking (optional, default: false) |
| `enableToolResultStorage` | `boolean` | Enable storage of tool execution results in memory (optional, default: false) |
| `maxMemoryTokens` | `number` | Maximum token limit for workflow memory (optional, default: 512) |


#### AgentMemoryConfig

Configure advanced memory management features for workflows to optimize token usage and performance.

| Property | Type | Description |
|----------|------|-------------|
| `enableMessageSummarization` | `boolean` | Enable automatic summarization of old messages (optional, default: false) |
| `enableMessagePruning` | `boolean` | Enable automatic pruning of old messages when token limit is reached (optional, default: false) |
| `enableMessageHistory` | `boolean` | Enable full message history tracking (optional, default: false) |
| `enableToolResultStorage` | `boolean` | Enable storage of tool execution results in memory (optional, default: false) |
| `maxMemoryTokens` | `number` | Maximum token limit for workflow memory (optional, default: 512) |

#### Tool

| Property | Type | Description |
|----------|------|-------------|
| `type` | `'function'` | Tool type (currently only 'function') |
| `function` | `object` | Function definition |
| `function.name` | `string` | Function name |
| `function.description` | `string` | Function description |
| `function.parameters` | `object` | JSON Schema for parameters |
| `function.parameters.type` | `'object'` | Parameter schema type |
| `function.parameters.properties` | `Record<string, any>` | Parameter properties |
| `function.parameters.required` | `string[]` | Required parameter names |
| `function.implementation` | `Function` | JavaScript implementation (optional) |

### Additional Types

#### EngineKind

Supported inference engines:
```typescript
type EngineKind = 'auto' | 'webgpu' | 'wasm' | 'webnn';
```

#### WorkerInstance

Internal worker instance type representing the Web Worker handling model inference.

#### InitArgs

Worker initialization arguments including model configuration and runtime settings.

#### MessageContent

Message content type that can be either a string or structured content with metadata.

#### WorkflowIterationResponse

Enhanced response type for workflow iterations:

| Property | Type | Description |
|----------|------|-------------|
| `stepId` | `string` | ID of the current step (optional) |
| `error` | `WorkflowStepError` | Error information if step failed (optional) |
| `content` | `string` | Generated content (optional) |
| `toolCall` | `object` | Tool execution details (optional) |
| `metadata` | `Record<string, any>` | Additional metadata (optional) |

## 🌐 Browser Support

- **WebGPU**: Chrome 113+, Edge 113+, Firefox with WebGPU enabled
- **WebAssembly**: All modern browsers
- **Minimum Requirements**: 4GB RAM recommended for small models

## 🔧 Development

### Building from Source

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
│   ├── result-builder.ts             # Workflow result construction
│   ├── workflow-state.ts             # Workflow state management
│   └── index.ts                      # Workflow exports
├── processing/                       # Content and tool processing
│   ├── content/
│   │   ├── processor.ts              # Content processing utilities
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
├── types/                            # Type definitions
│   ├── agent-session.ts              # Agent session types
│   ├── session.ts                    # Basic session types
│   ├── worker.ts                     # Internal worker types
│   └── workflow-state.ts             # Workflow state types
└── utils/                            # Utility modules
    ├── logger.ts                     # Logging utilities
    ├── logger-config.ts              # Logger configuration
    └── token-counter.ts              # Token counting utilities
```

### Running the Examples

```bash
# Build the library
npm run build

# Serve the examples (requires a local server)
cd examples
npx http-server . -c-1

# Open the demo in your browser:
# http://localhost:8080/demo.html
```

#### Available Examples

1. **`examples/demo.html`** - Interactive demonstration with two main sections:

   - **🔧 Agent Workflow Tab**: Advanced agent workflows with step-by-step execution
     - Math Problem Solver workflow with calculator tool
     - Demonstrates think → act → respond step pattern
     - Real-time step visualization and tool call tracking
     - Pre-loaded with sample math problems for testing

   - **💬 Direct Chat Tab**: Basic text generation and function calling
     - Simple prompt-response interaction
     - Optional tool integration with configurable JSON tools
     - Pre-configured weather tool example
     - Hugging Face token support for private models
     - Streaming token generation with TTFB metrics

2. **`examples/weather-planner-demo.html`** - Advanced Weather Activity Planning Demo:

   - **🌦️ Weather-Based Activity Planning**: Intelligent activity recommendations based on weather conditions
     - Multi-step workflow with geocoding, weather forecasting, and POI search
     - Dynamic indoor/outdoor activity selection based on weather conditions
     - Budget-aware filtering and distance-based recommendations
     - Calendar event generation with time slots
   
   - **Features**:
     - Location input with geocoding support
     - Date and time window configuration
     - Budget preferences (free, cheap, any)
     - Activity type preferences
     - Real-time workflow execution visualization
     - Comprehensive result display with itinerary



## 🧠 Agent Workflow Patterns

### Step Types

Agent workflows support four main step types:

- **`think`**: Analysis, reasoning, and planning steps
- **`act`**: Action steps that use tools to interact with external systems
- **`decide`**: Decision-making steps with conditional logic
- **`respond`**: Final response or summary generation

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

#### 3. Context Management & Memory Configuration

Configure agent memory to optimize performance and token usage:

##### Memory Strategy Selection
```javascript
// For long-running workflows with many steps
const longWorkflowMemory = {
  enableMessagePruning: true,        // Auto-remove old messages
  enableMessageSummarization: true,  // Summarize conversation history
  maxMemoryTokens: 2048,            // Higher limit for complex workflows
  enableToolResultStorage: false    // Disable to save tokens
};

// For tool-heavy workflows
const toolIntensiveMemory = {
  enableToolResultStorage: true,     // Keep tool results in memory
  enableMessageHistory: true,        // Full history for tool context
  maxMemoryTokens: 1536,            // Moderate limit
  enableMessagePruning: false       // Keep all messages for tool context
};

// For simple sequential workflows
const simpleWorkflowMemory = {
  enableMessagePruning: false,       // Keep all messages (small workflow)
  enableMessageSummarization: false, // No summarization needed
  maxMemoryTokens: 512,             // Lower limit for efficiency
  enableMessageHistory: false       // Minimal history tracking
};
```

##### Best Practices
- **Token Management**: Set `maxMemoryTokens` to 20-30% of your model's context window
- **Step Context**: Pass only essential context between steps using structured metadata
- **Memory Pruning**: Enable for workflows with >5 steps or long conversations
- **Tool Results**: Store tool results only when subsequent steps need the data
- **Summarization**: Use for workflows that reference early conversation context
- **History Tracking**: Enable full history only when steps need complete conversation context

##### Dynamic Memory Adjustment
```javascript
// Adjust memory config based on workflow complexity
const getMemoryConfig = (stepCount, hasTools, maxTokens) => ({
  enableMessagePruning: stepCount > 5,
  enableMessageSummarization: stepCount > 8,
  enableToolResultStorage: hasTools,
  maxMemoryTokens: Math.min(maxTokens * 0.3, 2048)
});
```

#### 4. Model Selection
- Use reasoning models for analysis and inference
- Use tool_use models for tool-specific workflows
- Consider using specialized models for domain-specific tasks

### Advanced Workflow Features

#### Step Retry and Error Handling
Steps can automatically retry on failure:
```javascript
const workflow = {
  steps: [
    {
      id: 'api-call',
      description: 'Call external API',
      prompt: 'Fetch user data',
      generationTask: 'tool_use',
      maxAttempts: 3, // Retry up to 3 times on failure
      toolChoice: ['fetch_user_data']
    }
  ]
};
```

#### Memory Management
Optimize token usage with memory configuration:
```javascript
const workflow = {
  memoryConfig: {
    enableMessagePruning: true,      // Auto-prune old messages
    enableMessageSummarization: true, // Summarize conversation history
    maxMemoryTokens: 1024            // Set token limit
  },
  steps: [/* ... */]
};
```

#### Workflow Timeout and Validation
Set execution limits:
```javascript
const workflow = {
  timeout: 30000,        // 30 second timeout
  maxIterations: 10,     // Maximum workflow iterations
  steps: [/* ... */]
};
```

## 🔍 Logging & Debugging

Agentary.js includes a comprehensive logging system for debugging and monitoring your AI applications.

### Basic Logging Usage

```typescript
import { logger, LogLevel, isDebuggingMode } from 'agentary-js';

// Use predefined category loggers
logger.session.info('Session created successfully'); [[memory:6381875]]
logger.worker.debug('Processing generation request', { prompt: 'Hello' });
logger.agent.warn('Step timeout approaching', { stepId: 'step-1' });

// Or use custom categories
logger.info('custom-category', 'Custom message', { data: 'example' });

// Check if debugging mode is enabled
if (isDebuggingMode()) {
  logger.worker.debug('Detailed debug info', { workerState: state });
}
```

### Category Loggers

Agentary.js provides predefined category loggers for different parts of the system:

- `logger.session` - Session lifecycle and management
- `logger.worker` - Worker communication and model inference [[memory:6381875]]
- `logger.agent` - Agent workflow execution
- `logger.workflow` - Workflow state and step execution
- `logger.tools` - Tool parsing and execution

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

We welcome contributions! Please see our [Contributing Guide](.github/CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
## 🙋‍♀️ Support

- 📖 [Documentation](https://github.com/agentary-ai/agentary-js/wiki)
- 🐛 [Issue Tracker](https://github.com/agentary-ai/agentary-js/issues)
- 💬 [Discussions](https://github.com/agentary-ai/agentary-js/discussions)
