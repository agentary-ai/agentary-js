# Agentary JS

> A JavaScript SDK for running quantized small language models in the browser using WebGPU and WebAssembly

[![npm version](https://img.shields.io/npm/v/agentary-js.svg)](https://www.npmjs.com/package/agentary-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

- **Browser-Native**: Run small language models directly in the browser without server dependencies
- **WebGPU Acceleration**: Leverage WebGPU for high-performance inference when available
- **Quantized Models**: Support for efficient quantized models (Q4, Q8, etc.) for optimal performance
- **Streaming Generation**: Real-time token streaming with Time to First Byte (TTFB) metrics
- **Function Calling**: Built-in support for tool/function calling capabilities
- **Multi-Model Support**: Use different models for chat and function calling tasks
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

#### CreateSessionArgs

| Property | Type | Description |
|----------|------|-------------|
| `models` | `object` | Model configuration for different tasks |
| `models.chat` | `string` | Model ID for chat/text generation |
| `models.function_calling` | `string` | Model ID for function calling tasks |
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
├── index.ts              # Main library exports
├── runtime/
│   ├── session.ts        # Session management
│   ├── worker.ts         # Web Worker for model inference
│   └── worker-manager.ts # Worker lifecycle management
└── types/
    ├── api.ts           # Public API types
    └── worker.ts        # Internal worker types
```

### Running the Example

```bash
# Build the library
npm run build

# Serve the example (requires a local server)
cd examples/browser
npx http-server . -c-1

# Open http://localhost:8000 in your browser
```

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