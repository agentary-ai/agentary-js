# Model Support for Device Inference

This document describes the model support system for on-device inference in Agentary.

## Overview

Agentary validates models during device provider initialization to ensure they are supported for on-device inference. Each supported model has a configured message transformer that handles the conversion of Agentary's message format to the model's expected tokenizer format.

## Currently Supported Models

### Qwen3 0.6B (ONNX)

- **Model ID**: `onnx-community/Qwen3-0.6B-ONNX`
- **Display Name**: Qwen3 0.6B (ONNX)
- **Tool Calling**: ✅ Supported
- **Thinking Mode**: ✅ Supported
- **Notes**: Lightweight model optimized for on-device inference

## Checking Model Support

You can programmatically check if a model is supported before creating a provider:

```typescript
import { isSupportedModel, getSupportedModelIds, getModelConfig } from 'agentary-js';

// Check if a specific model is supported
if (isSupportedModel('onnx-community/Qwen3-0.6B-ONNX')) {
  console.log('Model is supported!');
}

// Get all supported model IDs
const supportedModels = getSupportedModelIds();
console.log('Supported models:', supportedModels);

// Get detailed configuration for a model
const config = getModelConfig('onnx-community/Qwen3-0.6B-ONNX');
console.log('Model info:', {
  name: config.displayName,
  supportsTools: config.supportsToolCalling,
  supportsThinking: config.supportsThinking
});
```

## Model Validation

When creating a device provider, the model is automatically validated:

```typescript
import { createSession } from 'agentary-js';

// This will work - supported model
const session = await createSession({
  models: [{
    runtime: 'transformers-js',
    model: 'onnx-community/Qwen3-0.6B-ONNX',
    quantization: 'q4',
    engine: 'webgpu'
  }]
});

// This will throw a ProviderConfigurationError - unsupported model
try {
  const session = await createSession({
    models: [{
      runtime: 'transformers-js',
      model: 'unsupported-model',
      quantization: 'q4',
      engine: 'webgpu'
    }]
  });
} catch (error) {
  console.error(error.message);
  // Output: Model "unsupported-model" is not supported for device inference. 
  //         Supported models: onnx-community/Qwen3-0.6B-ONNX
}
```

## Message Transformation

Each supported model has a message transformer that converts Agentary's universal message format to the model's expected format. This happens automatically during inference.

### Message Format Support

The Qwen message transformer supports:

1. **Simple text messages**:
   ```typescript
   { role: 'user', content: 'Hello' }
   ```

2. **Text content blocks**:
   ```typescript
   { 
     role: 'user', 
     content: [{ type: 'text', text: 'What is the weather?' }] 
   }
   ```

3. **Tool use (function calling)**:
   ```typescript
   {
     role: 'assistant',
     content: [{
       type: 'tool_use',
       id: 'tool_123',
       name: 'get_weather',
       arguments: { location: 'New York' }
     }]
   }
   ```

4. **Tool results**:
   ```typescript
   {
     role: 'user',
     content: [{
       type: 'tool_result',
       tool_use_id: 'tool_123',
       result: 'Sunny, 72°F'
     }]
   }
   ```

## Adding New Models

To add support for a new model:

### 1. Create a Message Transformer

Create a transformer function that converts Agentary messages to the model's format:

```typescript
// src/config/model-registry.ts

export const myModelTransformer: MessageTransformer = (messages: Message[]) => {
  // Transform messages to your model's expected format
  return messages.map(msg => {
    // Your transformation logic here
    return {
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : msg.content[0].text
    };
  });
};
```

### 2. Register the Model

Add the model to the `SUPPORTED_MODELS` registry:

```typescript
// src/config/model-registry.ts

export const SUPPORTED_MODELS: Record<string, ModelConfig> = {
  'onnx-community/Qwen3-0.6B-ONNX': {
    // ... existing config
  },
  'my-org/my-model-ONNX': {
    modelId: 'my-org/my-model-ONNX',
    displayName: 'My Model Name',
    messageTransformer: myModelTransformer,
    supportsToolCalling: true,  // or false
    supportsThinking: false,    // or true
    notes: 'Additional information about the model'
  }
};
```

### 3. Test the Model

Create tests for your transformer:

```typescript
// tests/config/model-registry.test.ts

describe('myModelTransformer', () => {
  it('should transform simple text messages', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello' }
    ];
    const result = myModelTransformer(messages);
    expect(result).toHaveLength(1);
    // Add assertions for your expected format
  });
});
```

### 4. Update Documentation

Update this file to list the newly supported model.

## API Reference

### Functions

#### `isSupportedModel(modelId: string): boolean`

Check if a model is supported for device inference.

**Parameters:**
- `modelId` - The model identifier to check

**Returns:** `true` if the model is supported, `false` otherwise

---

#### `getSupportedModelIds(): string[]`

Get a list of all supported model IDs.

**Returns:** Array of supported model ID strings

---

#### `getModelConfig(modelId: string): ModelConfig`

Get the configuration for a supported model.

**Parameters:**
- `modelId` - The model identifier

**Returns:** `ModelConfig` object containing model information

**Throws:** Error if the model is not supported

---

#### `getMessageTransformer(modelId: string): MessageTransformer`

Get the message transformer function for a model.

**Parameters:**
- `modelId` - The model identifier

**Returns:** `MessageTransformer` function

**Throws:** Error if the model is not supported

### Types

#### `ModelConfig`

```typescript
interface ModelConfig {
  modelId: string;          // Model identifier
  displayName: string;      // Human-readable name
  messageTransformer: MessageTransformer;
  supportsToolCalling: boolean;
  supportsThinking: boolean;
  notes?: string;          // Optional additional info
}
```

#### `MessageTransformer`

```typescript
type MessageTransformer = (messages: Message[]) => HFMessage[];
```

A function that transforms Agentary messages to Hugging Face tokenizer format.

## Error Handling

### ProviderConfigurationError

Thrown when attempting to create a device provider with an unsupported model:

```typescript
try {
  const session = await createSession({
    models: [{
      runtime: 'transformers-js',
      model: 'unsupported-model',
      quantization: 'q4',
      engine: 'webgpu'
    }]
  });
} catch (error) {
  if (error instanceof ProviderConfigurationError) {
    // Handle configuration error
    console.error('Configuration error:', error.message);
  }
}
```

The error message will include:
- The model ID that was attempted
- A list of all supported models

## Best Practices

1. **Always validate models before use**: Use `isSupportedModel()` to check model support before creating providers
2. **Handle errors gracefully**: Catch `ProviderConfigurationError` and provide helpful feedback to users
3. **Test transformers thoroughly**: Ensure message transformers handle all content types your application uses
4. **Document model capabilities**: Clearly indicate which models support tool calling and thinking modes

## Future Enhancements

Planned improvements to the model support system:

- [ ] Dynamic model registration API
- [ ] Runtime transformer validation
- [ ] Model capability detection
- [ ] Transformer composition utilities
- [ ] Support for custom tokenizer formats

