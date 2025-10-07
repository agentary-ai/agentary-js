# Memory System Documentation

The agent memory system is built around a flexible, plugin-based architecture that allows you to customize how agent memory is stored, retrieved, formatted, and compressed.

## Overview

The memory system consists of three main components managed by the `MemoryManager`:

1. **Memory** - How messages are stored and retrieved (e.g., `SlidingWindowMemory`)
2. **Memory Formatter** - How messages are formatted for the LLM (e.g., `DefaultMemoryFormatter`)
3. **Memory Compressor** - How memory is compressed when it grows too large (e.g., `LLMSummarization`)

## Architecture

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

## Quick Start

### Using Default Configuration

The system works out of the box with sensible defaults:

```typescript
import { createAgentSession } from 'agentary';

const agent = await createAgentSession({
  model: {
    kind: 'onnx',
    modelId: 'Qwen/Qwen2.5-0.5B-Instruct',
    device: 'gpu',
    quantization: 'q4'
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

### Customizing Memory Configuration

Configure memory with custom strategies:

```typescript
import { 
  createAgentSession,
  SlidingWindowMemory,
  LLMSummarization,
  DefaultMemoryFormatter
} from 'agentary';

const workflow = {
  id: 'my-workflow',
  systemPrompt: 'You are a helpful assistant.',
  maxIterations: 10,
  memoryConfig: {
    memory: new SlidingWindowMemory(4096), // Keep last 4096 tokens
    formatter: new DefaultMemoryFormatter({
      stepInstructionTemplate: 'Task {stepId}: {prompt}',
      toolResultsTemplate: 'Available Data:\n{results}'
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

## Built-in Implementations

### Memory Implementations

#### SlidingWindowMemory

Keeps the most recent messages within a token limit. Automatically prunes old messages when approaching the limit.

```typescript
import { SlidingWindowMemory } from 'agentary';

const memory = new SlidingWindowMemory(2048); // Max 2048 tokens
```

**Features:**
- Automatic pruning at 90% capacity
- Preserves system and summary messages
- Checkpoint/rollback support
- Fast and efficient

**Configuration in workflow:**
```typescript
memoryConfig: {
  memory: new SlidingWindowMemory(4096),
  maxTokens: 4096,
  compressionThreshold: 0.8
}
```

### Memory Compressors

#### LLMSummarization

Uses an LLM to summarize conversation history into a concise format.

```typescript
import { LLMSummarization } from 'agentary';

const compressor = new LLMSummarization({
  systemPrompt: 'Summarize the conversation focusing on key facts.',
  userPromptTemplate: 'Summarize:\n{messages}',
  temperature: 0.1,
  maxSummaryTokens: 512
});
```

**Features:**
- Intelligent summarization preserving context
- Customizable prompts
- Configurable output length

**Configuration in workflow:**
```typescript
memoryConfig: {
  memoryCompressor: new LLMSummarization({
    systemPrompt: 'Focus on key decisions and outcomes.',
    maxSummaryTokens: 1024
  }),
  compressionThreshold: 0.8
}
```

### Memory Formatters

#### DefaultMemoryFormatter

Formats messages and context for LLM consumption.

```typescript
import { DefaultMemoryFormatter } from 'agentary';

const formatter = new DefaultMemoryFormatter({
  stepInstructionTemplate: '**Step {stepId}:** {prompt}',
  toolResultsTemplate: 'Tool Results:\n{results}',
  systemPromptTemplate: '{basePrompt}\n\n{context}',
  includeMetadata: false // Don't include message type labels
});
```

**Configuration in workflow:**
```typescript
memoryConfig: {
  formatter: new DefaultMemoryFormatter({
    stepInstructionTemplate: '## Task: {stepId}\n{prompt}',
    includeMetadata: true
  })
}
```

## Creating Custom Implementations

### Custom Memory Implementation

```typescript
import type { 
  Memory, 
  MemoryMessage, 
  MemoryMetrics,
  RetrievalOptions 
} from 'agentary';

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

### Custom Memory Compressor

```typescript
import type { 
  MemoryCompressor, 
  MemoryMessage, 
  MemoryMetrics,
  MemoryConfig 
} from 'agentary';

class HybridCompressor implements MemoryCompressor {
  name = 'hybrid';
  
  async compress(
    messages: MemoryMessage[], 
    targetTokens: number
  ): Promise<MemoryMessage[]> {
    // First, prune low-priority messages
    const highPriority = messages.filter(m => 
      m.metadata?.priority && m.metadata.priority > 5
    );
    
    // Then, summarize the rest if still over budget
    const remaining = messages.filter(m => !highPriority.includes(m));
    
    if (this.estimateTokens(remaining) > targetTokens * 0.5) {
      // Summarize using your custom logic
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

### Custom Formatter

```typescript
import type { MemoryFormatter, MemoryMessage, ToolResult } from 'agentary';
import type { Message } from 'agentary';

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

## Using the MemoryManager Directly

You can also use `MemoryManager` directly outside of workflows:

```typescript
import { MemoryManager, SlidingWindowMemory, LLMSummarization } from 'agentary';

const memoryManager = new MemoryManager(session, {
  memory: new SlidingWindowMemory(4096),
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

## Advanced Features

### Checkpoints and Rollback

```typescript
const workflow = {
  memoryConfig: {
    memory: new SlidingWindowMemory(2048)
  },
  // ...
};

// In your workflow logic (via MemoryManager):
// Create checkpoint before risky operation
memoryManager.createCheckpoint('before-tool-call');

// ... perform operation ...

// Rollback if needed
if (operationFailed) {
  memoryManager.rollbackToCheckpoint('before-tool-call');
}
```

### Filtered Retrieval

The `Memory` interface supports filtered retrieval:

```typescript
// Retrieve only specific message types
const systemMessages = await memory.retrieve({
  includeTypes: ['system', 'summary']
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

### Message Metadata

Messages include rich metadata for smarter retrieval:

```typescript
const message: MemoryMessage = {
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

## API Reference

### MemoryManager

```typescript
class MemoryManager {
  constructor(session: Session, config?: MemoryConfig);
  
  // Message operations
  addMessages(messages: Message[], skipCompression?: boolean): Promise<void>;
  getMessages(): Promise<Message[]>;
  rollbackToCount(targetCount: number): Promise<void>;
  
  // Metrics and status
  getMetrics(): MemoryMetrics;
  getMessageCount(): number;
  getTokenCount(): number;
  isNearLimit(): boolean;
  
  // Formatting helpers
  formatStepInstruction(stepId: string, prompt: string): string;
  formatToolResults(results: Record<string, ToolResult>): string;
  formatSystemPrompt(basePrompt: string, context?: string): string;
  
  // Checkpoint operations
  createCheckpoint(id: string): void;
  rollbackToCheckpoint(id: string): void;
  
  // Memory management
  clear(): void;
}
```

### Memory Interface

```typescript
interface Memory {
  name: string;
  
  add(messages: MemoryMessage[]): Promise<void>;
  retrieve(options?: RetrievalOptions): Promise<MemoryMessage[]>;
  compress?(options?: CompressionOptions): Promise<void>;
  getMetrics(): MemoryMetrics;
  clear(): void;
  rollback?(checkpoint: string): void;
  createCheckpoint?(id: string): void;
}
```

### MemoryCompressor Interface

```typescript
interface MemoryCompressor {
  name: string;
  
  compress(
    messages: MemoryMessage[], 
    targetTokens: number,
    session?: Session
  ): Promise<MemoryMessage[]>;
  
  shouldCompress(metrics: MemoryMetrics, config: MemoryConfig): boolean;
}
```

### MemoryFormatter Interface

```typescript
interface MemoryFormatter {
  formatMessages(messages: MemoryMessage[]): Message[];
  formatToolResults?(results: Record<string, ToolResult>): string;
  formatStepInstruction?(stepId: string, prompt: string): string;
  formatSystemPrompt?(basePrompt: string, context?: string): string;
}
```

### MemoryConfig

```typescript
interface MemoryConfig {
  memory?: Memory;
  formatter?: MemoryFormatter;
  memoryCompressor?: MemoryCompressor;
  maxTokens?: number;
  compressionThreshold?: number; // 0-1, percentage of maxTokens
  autoCompress?: boolean;
  checkpointInterval?: number;
}
```

## Best Practices

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

## Common Patterns

### Pattern 1: Simple Chat Agent

```typescript
const workflow = {
  id: 'chat-agent',
  memoryConfig: {
    memory: new SlidingWindowMemory(2048)
  },
  // ...
};
```

### Pattern 2: Long-Running Agent with Summarization

```typescript
const workflow = {
  id: 'long-running-agent',
  memoryConfig: {
    memory: new SlidingWindowMemory(4096),
    memoryCompressor: new LLMSummarization({
      systemPrompt: 'Summarize focusing on decisions and outcomes.',
      maxSummaryTokens: 512
    }),
    maxTokens: 4096,
    compressionThreshold: 0.75
  },
  // ...
};
```

### Pattern 3: RAG-Style Agent

```typescript
const workflow = {
  id: 'rag-agent',
  memoryConfig: {
    memory: new VectorDBMemory('connection-string'),
    maxTokens: 8192
  },
  // ...
};
```

### Pattern 4: Multi-Step Workflow with Custom Formatting

```typescript
const workflow = {
  id: 'multi-step-workflow',
  memoryConfig: {
    memory: new SlidingWindowMemory(4096),
    formatter: new DefaultMemoryFormatter({
      stepInstructionTemplate: '### Step {stepId}\n{prompt}',
      toolResultsTemplate: '## Results\n{results}'
    }),
    maxTokens: 4096
  },
  // ...
};
```

## Examples

Check out these example implementations:

- [Basic workflow with default memory](examples/weather-planner-demo.html)
- Creating custom memory strategies (see "Creating Custom Implementations" above)
- Using semantic search with vector databases (see "Custom Memory Implementation" above)

## Troubleshooting

### Memory Growing Too Fast

If memory grows faster than expected:
- Lower `maxTokens` in your config
- Reduce `compressionThreshold` for more aggressive compression
- Use `LLMSummarization` for better compression ratios

### Losing Important Context

If compression is losing critical information:
- Tag important messages with high `priority` in metadata
- Use `preserveTypes` in compression options
- Increase `compressionThreshold` to compress less frequently
- Customize summarization prompts to preserve specific information

### Performance Issues

If memory operations are slow:
- Use simpler memory implementations (avoid complex DB queries)
- Reduce compression frequency
- Optimize your custom implementations
- Monitor `MemoryMetrics` to identify bottlenecks
