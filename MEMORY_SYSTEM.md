# Memory System Documentation

The agent memory system has been redesigned to be plugin-based and agnostic to specific implementations. This allows you to customize how agent memory is stored, retrieved, and compressed.

## Overview

The new memory system consists of three main components:

1. **Memory Strategy** - How messages are stored and retrieved
2. **Memory Formatter** - How messages are formatted for the LLM
3. **Compression Strategy** - How memory is compressed when it grows too large

## Quick Start

### Using Default Configuration (Backward Compatible)

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
  memoryConfig: {
    enableMessageHistory: true,
    enableMessageSummarization: true,
    maxMemoryTokens: 2048
  },
  steps: [/* your steps */],
  tools: []
};

for await (const result of agent.runWorkflow('Help me plan my day', workflow)) {
  console.log(result);
}
```

### Using the New Plugin System

For more control, use the new plugin-based configuration:

```typescript
import { 
  createAgentSession,
  SlidingWindowStrategy,
  SummarizationCompressionStrategy,
  DefaultMemoryFormatter
} from 'agentary';

const workflow = {
  id: 'my-workflow',
  systemPrompt: 'You are a helpful assistant.',
  maxIterations: 10,
  memoryConfig: {
    strategy: new SlidingWindowStrategy(4096), // Keep last 4096 tokens
    formatter: new DefaultMemoryFormatter({
      stepInstructionTemplate: 'Task {stepId}: {prompt}',
      toolResultsTemplate: 'Available Data:\n{results}'
    }),
    compressionStrategy: new SummarizationCompressionStrategy({
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

## Built-in Strategies

### Memory Strategies

#### SlidingWindowStrategy

Keeps the most recent messages within a token limit. Automatically prunes old messages when approaching the limit.

```typescript
import { SlidingWindowStrategy } from 'agentary';

const strategy = new SlidingWindowStrategy(2048); // Max 2048 tokens
```

**Features:**
- Automatic pruning at 90% capacity
- Preserves system and summary messages
- Checkpoint/rollback support
- Fast and efficient

### Compression Strategies

#### SummarizationCompressionStrategy

Uses an LLM to summarize conversation history into a concise format.

```typescript
import { SummarizationCompressionStrategy } from 'agentary';

const compression = new SummarizationCompressionStrategy({
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

## Creating Custom Strategies

### Custom Memory Strategy

```typescript
import type { 
  MemoryStrategy, 
  MemoryMessage, 
  MemoryMetrics,
  RetrievalOptions 
} from 'agentary';

class VectorDBStrategy implements MemoryStrategy {
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
      compressionCount: 0
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
    strategy: new VectorDBStrategy('mongodb://localhost:27017'),
    maxTokens: 8192
  },
  // ...
};
```

### Custom Compression Strategy

```typescript
import type { 
  CompressionStrategy, 
  MemoryMessage, 
  MemoryMetrics,
  MemoryConfig 
} from 'agentary';

class HybridCompressionStrategy implements CompressionStrategy {
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

## Advanced Features

### Checkpoints and Rollback

```typescript
import { SlidingWindowStrategy } from 'agentary';

const strategy = new SlidingWindowStrategy(2048);

// Create checkpoint before risky operation
if (strategy.createCheckpoint) {
  strategy.createCheckpoint('before-tool-call');
}

// ... perform operation ...

// Rollback if needed
if (operationFailed && strategy.rollback) {
  strategy.rollback('before-tool-call');
}
```

### Filtered Retrieval

```typescript
// Retrieve only specific message types
const systemMessages = await strategy.retrieve({
  includeTypes: ['system', 'summary']
});

// Retrieve messages since a timestamp
const recentMessages = await strategy.retrieve({
  sinceTimestamp: Date.now() - 3600000 // Last hour
});

// Retrieve with token limit
const limitedMessages = await strategy.retrieve({
  maxTokens: 1024
});
```

### Message Metadata

Messages can include rich metadata for smarter retrieval:

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

## Migration from Legacy Config

The old configuration still works:

```typescript
// Old way (still supported)
memoryConfig: {
  enableMessageSummarization: true,
  enableMessagePruning: true,
  enableMessageHistory: true,
  maxMemoryTokens: 2048
}

// Automatically converts to:
memoryConfig: {
  strategy: new SlidingWindowStrategy(2048),
  formatter: new DefaultMemoryFormatter(),
  compressionStrategy: new SummarizationCompressionStrategy(),
  maxTokens: 2048,
  compressionThreshold: 0.8
}
```

## Best Practices

1. **Choose the right strategy for your use case:**
   - Use `SlidingWindowStrategy` for most applications
   - Use semantic search for RAG-style applications
   - Use custom strategies for specific requirements

2. **Set appropriate token limits:**
   - Leave headroom for your prompts and outputs
   - Monitor `MemoryMetrics` to tune limits

3. **Customize formatters for your domain:**
   - Use clear, consistent formatting
   - Include relevant context in templates

4. **Test compression strategies:**
   - Ensure summaries preserve critical information
   - Balance compression ratio vs. context preservation

5. **Use metadata effectively:**
   - Tag important messages with high priority
   - Use timestamps for temporal filtering
   - Use custom types for domain-specific filtering

## API Reference

See the [TypeScript definitions](src/types/memory.ts) for complete API documentation.

## Examples

- [Basic workflow with default memory](examples/weather-planner-demo.html)
- [Custom memory strategy example](examples/custom-memory-strategy.ts) (TODO)
- [Semantic search with vector DB](examples/semantic-memory.ts) (TODO)

