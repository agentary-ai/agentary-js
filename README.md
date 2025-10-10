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
| `memoryConfig` | `MemoryConfig` | Memory management configuration (optional) - see [Memory System](#-memory-system) |

#### MemoryConfig

Configure advanced memory management features for workflows to optimize token usage and performance. See the [Memory System](#-memory-system) section for comprehensive documentation.

| Property | Type | Description |
|----------|------|-------------|
| `memory` | `Memory` | Storage strategy implementation (optional, default: `SlidingWindowMemory`) |
| `formatter` | `MemoryFormatter` | Message formatter (optional, default: `DefaultMemoryFormatter`) |
| `memoryCompressor` | `MemoryCompressor` | Compression strategy (optional, default: none) |
| `maxTokens` | `number` | Maximum token limit for workflow memory (optional, default: 1024) |
| `compressionThreshold` | `number` | Percentage (0-1) of maxTokens to trigger compression (optional, default: 0.8) |
| `preserveMessageTypes` | `string[]` | Message types to never compress (optional) |
| `autoCompress` | `boolean` | Auto-compress when adding messages (optional) |
| `checkpointInterval` | `number` | Checkpoint frequency for rollback support (optional) |

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

#### Memory System Types

The following types and classes are exported for memory system customization. See the [Memory System](#-memory-system) section for detailed documentation.

**Classes:**
- `MemoryManager` - Main memory management class
- `SlidingWindowMemory` - Sliding window memory implementation
- `LLMSummarization` - LLM-based memory compression
- `DefaultMemoryFormatter` - Default message formatter

**Types:**
- `Memory` - Memory storage interface
- `MemoryFormatter` - Message formatting interface
- `MemoryCompressor` - Memory compression interface
- `MemoryMessage` - Message with metadata
- `MemoryConfig` - Memory configuration options
- `MemoryMetrics` - Memory usage metrics
- `RetrievalOptions` - Message retrieval options
- `CompressionOptions` - Compression configuration
- `ToolResult` - Tool execution result format
- `LLMSummarizationConfig` - LLM summarization configuration

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

#### 3. Memory Management

Configure agent memory to optimize performance and token usage. See the [Memory System](#-memory-system) section for comprehensive documentation.

##### Quick Memory Configuration Examples
```javascript
import { SlidingWindowMemory, LLMSummarization, DefaultMemoryFormatter } from 'agentary-js';

// For long-running workflows with many steps
const longWorkflowMemory = {
  memory: new SlidingWindowMemory(),
  memoryCompressor: new LLMSummarization({
    maxSummaryTokens: 512,
    recentWindowSize: 4
  }),
  maxTokens: 2048,
  compressionThreshold: 0.75
};

// For simple sequential workflows
const simpleWorkflowMemory = {
  memory: new SlidingWindowMemory(),
  maxTokens: 1024,
  compressionThreshold: 0.9  // Less aggressive compression
};

// For workflows with custom formatting
const customFormattedMemory = {
  memory: new SlidingWindowMemory(),
  formatter: new DefaultMemoryFormatter({
    stepInstructionTemplate: '## Step {stepId}\n{prompt}',
    includeMetadata: true
  }),
  maxTokens: 1536
};
```

##### Best Practices
- **Token Management**: Set `maxTokens` to 20-30% of your model's context window
- **Memory Implementation**: Use `SlidingWindowMemory` for most use cases
- **Compression**: Use `LLMSummarization` for workflows with >5 steps that reference early context
- **Formatting**: Customize `DefaultMemoryFormatter` templates for your domain
- **Monitoring**: Use `memoryManager.getMetrics()` to track memory usage

#### 4. Model Selection
- Use reasoning models for analysis and inference
- Use tool_use models for tool-specific workflows
- Consider using specialized models for domain-specific tasks

## 🧠 Memory System

The memory system provides a flexible, plugin-based architecture for managing agent memory during workflow execution. It allows you to customize how messages are stored, retrieved, formatted, and compressed to optimize performance and token usage.

### Architecture

The memory system consists of three main components managed by the `MemoryManager`:

1. **Memory** - How messages are stored and retrieved (e.g., `SlidingWindowMemory`)
2. **Memory Formatter** - How messages are formatted for the LLM (e.g., `DefaultMemoryFormatter`)
3. **Memory Compressor** - How memory is compressed when it grows too large (e.g., `LLMSummarization`)

```
MemoryManager
    ├── Memory (storage & retrieval)
    │   └── SlidingWindowMemory
    │   └── Your custom implementation
    ├── MemoryFormatter (formatting)
    │   └── DefaultMemoryFormatter
    │   └── Your custom formatter
    └── MemoryCompressor (compression)
        └── LLMSummarization
        └── Your custom compressor
```

### Quick Start with Memory

#### Using Default Configuration

The system works out of the box with sensible defaults:

```javascript
import { createAgentSession } from 'agentary-js';

const agent = await createAgentSession({
  models: {
    chat: {
      name: 'onnx-community/gemma-3-270m-it-ONNX',
      quantization: 'q4'
    }
  }
});

const workflow = {
  id: 'my-workflow',
  systemPrompt: 'You are a helpful assistant.',
  maxIterations: 10,
  steps: [/* your steps */],
  tools: []
};

for await (const result of agent.runWorkflow('Help me plan my day', workflow)) {
  console.log(result);
}
```

#### Customizing Memory Configuration

Configure memory with custom strategies:

```javascript
import { 
  createAgentSession,
  SlidingWindowMemory,
  LLMSummarization,
  DefaultMemoryFormatter
} from 'agentary-js';

const workflow = {
  id: 'my-workflow',
  systemPrompt: 'You are a helpful assistant.',
  maxIterations: 10,
  memoryConfig: {
    memory: new SlidingWindowMemory(),
    formatter: new DefaultMemoryFormatter({
      stepInstructionTemplate: '**Task {stepId}:** {prompt}',
      toolResultsTemplate: '**Available Data:**\n{results}'
    }),
    memoryCompressor: new LLMSummarization({
      systemPrompt: 'Create a concise summary focusing on key decisions.',
      maxSummaryTokens: 1024
    }),
    maxTokens: 4096,
    compressionThreshold: 0.75 // Compress at 75% capacity
  },
  steps: [/* your steps */],
  tools: []
};
```

### Built-in Memory Implementations

#### SlidingWindowMemory

Keeps the most recent messages within a token limit. Automatically prunes old messages when approaching the limit.

```javascript
import { SlidingWindowMemory } from 'agentary-js';

const memory = new SlidingWindowMemory();
```

**Features:**
- Automatic pruning based on token limits
- Preserves system and summary messages
- Checkpoint/rollback support
- Fast and efficient

**Configuration in workflow:**
```javascript
memoryConfig: {
  memory: new SlidingWindowMemory(),
  maxTokens: 4096,
  compressionThreshold: 0.8
}
```

#### LLMSummarization

Uses an LLM to intelligently summarize conversation history into a concise format.

```javascript
import { LLMSummarization } from 'agentary-js';

const compressor = new LLMSummarization({
  systemPrompt: 'Summarize the conversation focusing on key facts and decisions.',
  userPromptTemplate: 'Summarize:\n{messages}',
  temperature: 0.1,
  maxSummaryTokens: 512,
  recentWindowSize: 4, // Keep last 4 messages unsummarized
  minMessagesToSummarize: 6 // Require at least 6 messages
});
```

**Features:**
- Intelligent summarization preserving context
- Customizable prompts and templates
- Configurable output length
- Preserves recent messages

**Configuration in workflow:**
```javascript
memoryConfig: {
  memoryCompressor: new LLMSummarization({
    systemPrompt: 'Focus on key decisions and outcomes.',
    maxSummaryTokens: 1024,
    recentWindowSize: 4
  }),
  compressionThreshold: 0.8
}
```

#### DefaultMemoryFormatter

Formats messages and context for LLM consumption with customizable templates.

```javascript
import { DefaultMemoryFormatter } from 'agentary-js';

const formatter = new DefaultMemoryFormatter({
  stepInstructionTemplate: '**Step {stepId}:** {prompt}',
  toolResultsTemplate: '**Tool Results:**\n{results}',
  systemPromptTemplate: '{basePrompt}\n\n{context}',
  includeMetadata: false // Don't include message type labels
});
```

**Configuration in workflow:**
```javascript
memoryConfig: {
  formatter: new DefaultMemoryFormatter({
    stepInstructionTemplate: '## Task: {stepId}\n{prompt}',
    includeMetadata: true
  })
}
```

### Memory Configuration Options

The `MemoryConfig` interface provides comprehensive configuration:

```typescript
interface MemoryConfig {
  memory?: Memory;                      // Storage strategy
  formatter?: MemoryFormatter;          // Message formatter
  memoryCompressor?: MemoryCompressor;  // Compression strategy
  maxTokens?: number;                   // Max tokens (default: 1024)
  compressionThreshold?: number;        // 0-1, trigger at % of max (default: 0.8)
  preserveMessageTypes?: string[];      // Types to never compress
  autoCompress?: boolean;               // Auto-compress on add
  checkpointInterval?: number;          // Checkpoint frequency
}
```

### Creating Custom Implementations

#### Custom Memory Implementation

```typescript
import type { 
  Memory, 
  MemoryMessage, 
  MemoryMetrics,
  RetrievalOptions 
} from 'agentary-js';

class VectorDBMemory implements Memory {
  name = 'vector-db';
  private db: YourVectorDB;
  
  constructor(connectionString: string) {
    this.db = new YourVectorDB(connectionString);
  }
  
  async add(messages: MemoryMessage[]): Promise<void> {
    // Store messages in vector DB with embeddings
    for (const msg of messages) {
      const embedding = await this.generateEmbedding(msg.content);
      await this.db.insert({
        content: msg.content,
        role: msg.role,
        embedding,
        metadata: msg.metadata
      });
    }
  }
  
  async retrieve(options?: RetrievalOptions): Promise<MemoryMessage[]> {
    // Retrieve semantically relevant messages
    if (options?.relevanceQuery) {
      const queryEmbedding = await this.generateEmbedding(options.relevanceQuery);
      return await this.db.similaritySearch(queryEmbedding, options.maxTokens);
    }
    
    // Or retrieve recent messages
    return await this.db.getRecent(options?.maxTokens || 2048);
  }
  
  getMetrics(): MemoryMetrics {
    return {
      messageCount: this.db.count(),
      estimatedTokens: this.db.totalTokens(),
      compressionCount: 0,
      lastCompressionTime: undefined
    };
  }
  
  clear(): void {
    this.db.clear();
  }
  
  private async generateEmbedding(text: string): Promise<number[]> {
    // Your embedding logic
    return [];
  }
}

// Use it in your workflow
const workflow = {
  memoryConfig: {
    memory: new VectorDBMemory('mongodb://localhost:27017'),
    maxTokens: 8192
  },
  // ...
};
```

#### Custom Memory Compressor

```typescript
import type { 
  MemoryCompressor, 
  MemoryMessage, 
  MemoryMetrics,
  MemoryConfig 
} from 'agentary-js';

class HybridCompressor implements MemoryCompressor {
  name = 'hybrid';
  
  async compress(
    messages: MemoryMessage[], 
    targetTokens: number
  ): Promise<MemoryMessage[]> {
    // First, keep high-priority messages
    const highPriority = messages.filter(m => 
      m.metadata?.priority && m.metadata.priority > 5
    );
    
    // Then, summarize the rest if still over budget
    const remaining = messages.filter(m => !highPriority.includes(m));
    
    if (this.estimateTokens(remaining) > targetTokens * 0.5) {
      const summary = await this.summarize(remaining);
      return [...highPriority, summary];
    }
    
    return [...highPriority, ...remaining];
  }
  
  shouldCompress(metrics: MemoryMetrics, config: MemoryConfig): boolean {
    return metrics.estimatedTokens > (config.maxTokens || 2048) * 0.8;
  }
  
  private async summarize(messages: MemoryMessage[]): Promise<MemoryMessage> {
    // Your summarization logic
    return {
      role: 'assistant',
      content: 'Summary of previous conversation...',
      metadata: { type: 'summary', timestamp: Date.now() }
    };
  }
  
  private estimateTokens(messages: MemoryMessage[]): number {
    return messages.reduce((sum, m) => sum + (m.metadata?.tokenCount || 0), 0);
  }
}
```

#### Custom Formatter

```typescript
import type { MemoryFormatter, MemoryMessage, ToolResult } from 'agentary-js';
import type { Message } from 'agentary-js';

class MarkdownFormatter implements MemoryFormatter {
  formatMessages(messages: MemoryMessage[]): Message[] {
    return messages.map(m => ({
      role: m.role,
      content: this.formatAsMarkdown(m)
    }));
  }
  
  formatToolResults(results: Record<string, ToolResult>): string {
    const entries = Object.values(results);
    if (entries.length === 0) return '';
    
    return '## Available Data\n\n' + 
      entries.map(r => `### ${r.name}\n${r.description}\n\`\`\`json\n${r.result}\n\`\`\``).join('\n\n');
  }
  
  formatStepInstruction(stepId: string, prompt: string): string {
    return `## Task: ${stepId}\n\n${prompt}`;
  }
  
  formatSystemPrompt(basePrompt: string, context?: string): string {
    let prompt = `# System Instructions\n\n${basePrompt}`;
    if (context) {
      prompt += `\n\n${context}`;
    }
    return prompt;
  }
  
  private formatAsMarkdown(message: MemoryMessage): string {
    const timestamp = message.metadata?.timestamp 
      ? new Date(message.metadata.timestamp).toISOString() 
      : '';
    const type = message.metadata?.type || message.role;
    
    return `**[${type}]** ${timestamp ? `_${timestamp}_` : ''}\n${message.content}`;
  }
}
```

### Using MemoryManager Directly

You can use `MemoryManager` directly outside of workflows:

```javascript
import { MemoryManager, SlidingWindowMemory, LLMSummarization } from 'agentary-js';

const memoryManager = new MemoryManager(session, {
  memory: new SlidingWindowMemory(),
  memoryCompressor: new LLMSummarization(),
  maxTokens: 4096,
  compressionThreshold: 0.75
});

// Add messages
await memoryManager.addMessages([
  { role: 'user', content: 'Hello!' },
  { role: 'assistant', content: 'Hi! How can I help?' }
]);

// Retrieve messages
const messages = await memoryManager.getMessages();

// Get metrics
const metrics = memoryManager.getMetrics();
console.log(`Messages: ${metrics.messageCount}, Tokens: ${metrics.estimatedTokens}`);

// Create checkpoint
memoryManager.createCheckpoint('before-operation');

// Rollback if needed
memoryManager.rollbackToCheckpoint('before-operation');

// Clear all memory
memoryManager.clear();
```

### Advanced Memory Features

#### Checkpoints and Rollback

```javascript
// Create checkpoint before risky operation
memoryManager.createCheckpoint('before-tool-call');

// ... perform operation ...

// Rollback if needed
if (operationFailed) {
  memoryManager.rollbackToCheckpoint('before-tool-call');
}
```

#### Filtered Retrieval

The `Memory` interface supports filtered retrieval:

```javascript
// Retrieve only specific message types
const systemMessages = await memory.retrieve({
  includeTypes: ['system_instruction', 'summary']
});

// Retrieve messages since a timestamp
const recentMessages = await memory.retrieve({
  sinceTimestamp: Date.now() - 3600000 // Last hour
});

// Retrieve with token limit
const limitedMessages = await memory.retrieve({
  maxTokens: 1024
});
```

#### Message Metadata

Messages include rich metadata for smarter retrieval:

```javascript
const message = {
  role: 'assistant',
  content: 'Important decision: We should proceed with option A.',
  metadata: {
    timestamp: Date.now(),
    stepId: 'decision-step',
    priority: 10, // High priority
    type: 'assistant',
    tokenCount: 15
  }
};
```

### Common Memory Patterns

#### Pattern 1: Simple Chat Agent

```javascript
const workflow = {
  id: 'chat-agent',
  memoryConfig: {
    memory: new SlidingWindowMemory(),
    maxTokens: 2048
  },
  // ...
};
```

#### Pattern 2: Long-Running Agent with Summarization

```javascript
const workflow = {
  id: 'long-running-agent',
  memoryConfig: {
    memory: new SlidingWindowMemory(),
    memoryCompressor: new LLMSummarization({
      systemPrompt: 'Summarize focusing on decisions and outcomes.',
      maxSummaryTokens: 512,
      recentWindowSize: 4
    }),
    maxTokens: 4096,
    compressionThreshold: 0.75
  },
  // ...
};
```

#### Pattern 3: Multi-Step Workflow with Custom Formatting

```javascript
const workflow = {
  id: 'multi-step-workflow',
  memoryConfig: {
    memory: new SlidingWindowMemory(),
    formatter: new DefaultMemoryFormatter({
      stepInstructionTemplate: '### Step {stepId}\n{prompt}',
      toolResultsTemplate: '## Results\n{results}'
    }),
    maxTokens: 4096
  },
  // ...
};
```

### Memory Best Practices

1. **Choose the right memory implementation:**
   - Use `SlidingWindowMemory` for most applications
   - Use semantic search/vector DB for RAG-style applications
   - Use custom implementations for specific requirements

2. **Set appropriate token limits:**
   - Leave headroom for your prompts and outputs
   - Monitor `MemoryMetrics` to tune limits
   - Consider your model's context window

3. **Customize formatters for your domain:**
   - Use clear, consistent formatting
   - Include relevant context in templates
   - Test different formats to find what works best

4. **Test compression strategies:**
   - Ensure summaries preserve critical information
   - Balance compression ratio vs. context preservation
   - Monitor compression frequency

5. **Use metadata effectively:**
   - Tag important messages with high priority
   - Use timestamps for temporal filtering
   - Use custom types for domain-specific filtering

6. **Leverage checkpoints:**
   - Create checkpoints before risky operations
   - Use rollback to recover from errors
   - Clean up old checkpoints periodically

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

## 📡 Lifecycle Events

Agentary.js provides a comprehensive event system that allows you to monitor and react to internal operations in real-time. You can subscribe to events for worker initialization, generation progress, tool execution, workflow steps, and more.

### Quick Start

```typescript
import { createSession } from 'agentary-js';

const session = await createSession({
  models: {
    chat: { name: 'onnx-community/gemma-3-270m-it-ONNX', quantization: 'q4' }
  }
});

// Subscribe to all events
session.on('*', (event) => {
  console.log(`Event: ${event.type}`, event);
});

// Subscribe to specific event types
session.on('worker:init:complete', (event) => {
  console.log(`Model loaded: ${event.modelName} in ${event.duration}ms`);
});

session.on('generation:token', (event) => {
  if (event.ttfbMs) {
    console.log(`TTFB: ${event.ttfbMs}ms`);
  }
  process.stdout.write(event.token);
});

// Unsubscribe when done
const unsubscribe = session.on('generation:complete', (event) => {
  console.log(`Generated ${event.totalTokens} tokens in ${event.duration}ms`);
  console.log(`Speed: ${event.tokensPerSecond?.toFixed(2)} tokens/sec`);
});

// Later: unsubscribe();
```

### Event Categories

#### Worker Lifecycle Events

Monitor model loading and worker initialization:

```typescript
// Worker initialization started
session.on('worker:init:start', (event) => {
  console.log(`Loading model: ${event.modelName}`);
});

// Worker initialization progress (if supported by the model)
session.on('worker:init:progress', (event) => {
  console.log(`Progress: ${event.progress}% - ${event.stage}`);
});

// Worker initialization complete
session.on('worker:init:complete', (event) => {
  console.log(`Model ready: ${event.modelName} (${event.duration}ms)`);
});

// Worker disposed
session.on('worker:disposed', (event) => {
  console.log(`Worker disposed: ${event.modelName}`);
});
```

#### Generation Events

Track text generation in real-time:

```typescript
// Generation started
session.on('generation:start', (event) => {
  console.log(`Starting generation with ${event.messageCount} messages`);
});

// Each token generated
session.on('generation:token', (event) => {
  if (event.isFirst) {
    console.log(`First token in ${event.ttfbMs}ms`);
  }
  if (!event.isLast) {
    process.stdout.write(event.token);
  }
});

// Generation complete
session.on('generation:complete', (event) => {
  console.log(`\nGenerated ${event.totalTokens} tokens`);
  console.log(`Speed: ${event.tokensPerSecond} tok/s`);
});

// Generation error
session.on('generation:error', (event) => {
  console.error(`Generation failed: ${event.error}`);
});
```

#### Tool Events

Monitor tool execution:

```typescript
// Tool call started
session.on('tool:call:start', (event) => {
  console.log(`Calling ${event.toolName}:`, event.args);
});

// Tool call completed
session.on('tool:call:complete', (event) => {
  console.log(`${event.toolName} completed in ${event.duration}ms`);
  console.log('Result:', event.result);
});

// Tool call failed
session.on('tool:call:error', (event) => {
  console.error(`${event.toolName} failed: ${event.error}`);
});
```

#### Workflow Events

Track workflow execution and step progress:

```typescript
const agent = await createAgentSession({...});

// Workflow started
agent.on('workflow:start', (event) => {
  console.log(`Starting workflow: ${event.workflowName}`);
  console.log(`Steps: ${event.stepCount}`);
});

// Step started
agent.on('workflow:step:start', (event) => {
  console.log(`\n[Step ${event.stepId}] ${event.stepDescription}`);
  console.log(`Iteration: ${event.iteration}`);
});

// Step completed
agent.on('workflow:step:complete', (event) => {
  const status = event.success ? '✓' : '✗';
  console.log(`${status} Step ${event.stepId} (${event.duration}ms)`);
  if (event.hasToolCall) {
    console.log('  - Tool was called');
  }
});

// Step retry
agent.on('workflow:step:retry', (event) => {
  console.log(`Retrying step ${event.stepId}`);
  console.log(`Attempt ${event.attempt}/${event.maxAttempts}`);
  console.log(`Reason: ${event.reason}`);
});

// Workflow complete
agent.on('workflow:complete', (event) => {
  console.log(`\nWorkflow complete!`);
  console.log(`Completed ${event.totalSteps} steps in ${event.duration}ms`);
});

// Workflow timeout
agent.on('workflow:timeout', (event) => {
  console.warn(`Workflow timeout at step ${event.stepId}`);
});

// Workflow error
agent.on('workflow:error', (event) => {
  console.error(`Workflow failed: ${event.error}`);
});
```

#### Memory Events

Monitor memory operations (when using memory system):

```typescript
// Memory checkpoint created
agent.on('memory:checkpoint', (event) => {
  console.log(`Checkpoint: ${event.checkpointId}`);
  console.log(`Messages: ${event.messageCount}, Tokens: ${event.estimatedTokens}`);
});

// Memory rolled back
agent.on('memory:rollback', (event) => {
  console.log(`Rolled back to: ${event.checkpointId}`);
});

// Memory compressed
agent.on('memory:compressed', (event) => {
  console.log(`Memory compressed: ${event.beforeTokens} → ${event.afterTokens}`);
  console.log(`Ratio: ${(event.compressionRatio * 100).toFixed(1)}%`);
});

// Memory pruned
agent.on('memory:pruned', (event) => {
  console.log(`Pruned ${event.messagesPruned} messages`);
  console.log(`Freed ${event.tokensFreed} tokens`);
});
```

### Event Types Reference

All events include a `timestamp` field (milliseconds since epoch) and a `type` field identifying the event.

#### Worker Events
- `worker:init:start` - Model initialization started
- `worker:init:progress` - Initialization progress update
- `worker:init:complete` - Model ready for inference
- `worker:disposed` - Worker terminated

#### Generation Events
- `generation:start` - Text generation started
- `generation:token` - Token generated
- `generation:complete` - Generation finished
- `generation:error` - Generation failed

#### Tool Events
- `tool:call:start` - Tool execution started
- `tool:call:complete` - Tool execution succeeded
- `tool:call:error` - Tool execution failed

#### Workflow Events
- `workflow:start` - Workflow execution started
- `workflow:step:start` - Step execution started
- `workflow:step:complete` - Step execution finished
- `workflow:step:retry` - Step retry attempt
- `workflow:complete` - Workflow finished successfully
- `workflow:timeout` - Workflow exceeded timeout
- `workflow:error` - Workflow failed

#### Memory Events
- `memory:checkpoint` - Memory checkpoint created
- `memory:rollback` - Memory rolled back to checkpoint
- `memory:compressed` - Memory compressed
- `memory:pruned` - Old messages pruned

### Advanced Usage

#### Filtering Events

```typescript
// Only listen to workflow events
agent.on('workflow:start', handleWorkflowStart);
agent.on('workflow:complete', handleWorkflowComplete);
agent.on('workflow:error', handleWorkflowError);

// Build a progress UI
agent.on('workflow:step:start', (event) => {
  updateProgressBar(event.stepId, event.iteration);
});

agent.on('workflow:step:complete', (event) => {
  markStepComplete(event.stepId, event.success);
});
```

#### Building Dashboards

```typescript
const metrics = {
  tokensGenerated: 0,
  toolCalls: 0,
  errors: 0,
  avgGenerationTime: []
};

session.on('generation:complete', (event) => {
  metrics.tokensGenerated += event.totalTokens;
  metrics.avgGenerationTime.push(event.duration);
  updateDashboard(metrics);
});

session.on('tool:call:complete', (event) => {
  metrics.toolCalls++;
  updateDashboard(metrics);
});

session.on('*:error', (event) => {
  metrics.errors++;
  updateDashboard(metrics);
});
```

#### Error Handling

```typescript
session.on('generation:error', (event) => {
  logger.error('Generation failed', {
    requestId: event.requestId,
    error: event.error
  });
  // Retry logic, user notification, etc.
});

agent.on('tool:call:error', (event) => {
  console.error(`Tool ${event.toolName} failed:`, event.error);
  // Fallback logic
});

agent.on('workflow:error', (event) => {
  console.error(`Workflow ${event.workflowId} failed at step ${event.stepId}`);
  // Cleanup, rollback, or notification
});
```

#### Performance Monitoring

```typescript
const perfMonitor = {
  ttfb: [],
  throughput: [],
  stepDurations: {}
};

session.on('generation:token', (event) => {
  if (event.ttfbMs) {
    perfMonitor.ttfb.push(event.ttfbMs);
  }
});

session.on('generation:complete', (event) => {
  if (event.tokensPerSecond) {
    perfMonitor.throughput.push(event.tokensPerSecond);
  }
});

agent.on('workflow:step:complete', (event) => {
  if (!perfMonitor.stepDurations[event.stepId]) {
    perfMonitor.stepDurations[event.stepId] = [];
  }
  perfMonitor.stepDurations[event.stepId].push(event.duration);
});

// Analyze performance
function analyzePerformance() {
  const avgTTFB = perfMonitor.ttfb.reduce((a, b) => a + b, 0) / perfMonitor.ttfb.length;
  const avgThroughput = perfMonitor.throughput.reduce((a, b) => a + b, 0) / perfMonitor.throughput.length;

  console.log(`Average TTFB: ${avgTTFB.toFixed(2)}ms`);
  console.log(`Average throughput: ${avgThroughput.toFixed(2)} tok/s`);
}
```

### TypeScript Support

All event types are fully typed for TypeScript users:

```typescript
import type {
  SessionEvent,
  WorkerInitCompleteEvent,
  GenerationTokenEvent,
  ToolCallStartEvent,
  WorkflowStepCompleteEvent
} from 'agentary-js';

// Type-safe event handlers
session.on('worker:init:complete', (event: WorkerInitCompleteEvent) => {
  console.log(event.modelName, event.duration); // Autocomplete works!
});

// Handle multiple event types
function handleEvent(event: SessionEvent) {
  switch (event.type) {
    case 'worker:init:complete':
      console.log('Model loaded:', event.modelName);
      break;
    case 'generation:token':
      process.stdout.write(event.token);
      break;
    case 'tool:call:start':
      console.log('Tool call:', event.toolName);
      break;
  }
}

session.on('*', handleEvent);
```

### Best Practices

1. **Unsubscribe when done**: Always call the returned unsubscribe function to prevent memory leaks
```typescript
const unsubscribe = session.on('generation:token', handler);
// Later:
unsubscribe();
```

2. **Use wildcards sparingly**: The `*` wildcard subscribes to all events, which can be noisy
```typescript
// Good for debugging
session.on('*', (e) => console.log(e.type));

// Better for production
session.on('generation:error', handleError);
session.on('workflow:error', handleError);
```

3. **Handle errors gracefully**: Event handlers should not throw errors
```typescript
session.on('generation:token', (event) => {
  try {
    processToken(event.token);
  } catch (error) {
    console.error('Error processing token:', error);
  }
});
```

4. **Don't block event handlers**: Keep event handlers fast and non-blocking
```typescript
// Bad: Blocking operation
session.on('tool:call:complete', (event) => {
  syncExpensiveOperation(event.result); // Blocks event loop
});

// Good: Async operation
session.on('tool:call:complete', async (event) => {
  await asyncOperation(event.result); // Non-blocking
});
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
