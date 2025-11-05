# Model Validation and Configurable Message Transformation

## Summary

This update adds model validation for device providers and makes message transformation configurable based on the initialized model. Previously, all models used the same hardcoded message transformation logic. Now, each supported model can have its own transformer, and unsupported models are rejected at initialization time.

## Changes Made

### 1. New Model Registry System

**File**: `src/config/model-registry.ts` (NEW)

- Created a centralized registry of supported models for device inference
- Currently supports: `onnx-community/Qwen3-0.6B-ONNX`
- Each model has:
  - Display name
  - Message transformer function
  - Tool calling support flag
  - Thinking mode support flag
  - Optional notes

**Key Functions**:
- `isSupportedModel(modelId)` - Check if a model is supported
- `getModelConfig(modelId)` - Get model configuration
- `getSupportedModelIds()` - Get all supported model IDs
- `getMessageTransformer(modelId)` - Get transformer for a model
- `qwenMessageTransformer` - Default transformer for Qwen models

### 2. Updated Worker Types

**File**: `src/types/worker.ts`

- Added `modelId` field to `InitArgs` interface
- Worker now receives model ID during initialization

### 3. Enhanced Device Provider

**File**: `src/providers/device.ts`

- **Constructor validation**: Throws `ProviderConfigurationError` if model is not supported
- **Error messages**: Include list of supported models in error
- **Init message**: Passes `modelId` to worker for transformer selection

### 4. Configurable Worker Message Transformation

**File**: `src/workers/worker.ts`

- **Removed hardcoded transformation**: Extracted message transformation logic to registry
- **Dynamic transformer loading**: Loads appropriate transformer during `handleInit`
- **Model-specific transformations**: Uses transformer from registry based on model ID
- **Better error handling**: Validates transformer availability before generation

**Changes**:
- Added `messageTransformer` module variable
- `handleInit` now loads transformer for the specific model
- `handleGenerate` uses the loaded transformer instead of inline logic
- `handleDispose` cleans up transformer reference

### 5. Public API Exports

**File**: `src/index.ts`

New exports:
- `isSupportedModel` - Function to check model support
- `getModelConfig` - Function to get model configuration
- `getSupportedModelIds` - Function to list supported models
- `SUPPORTED_MODELS` - Registry constant
- `ModelConfig` (type) - Model configuration interface
- `MessageTransformer` (type) - Transformer function type

### 6. Configuration Module

**File**: `src/config/index.ts` (NEW)

- Re-exports all model registry functions and types
- Provides clean import path for configuration utilities

### 7. Comprehensive Tests

**File**: `tests/config/model-registry.test.ts` (NEW)

Tests for:
- Model support checking
- Configuration retrieval
- Transformer functionality
- Message transformation for all content types (text, tool_use, tool_result)
- Error handling for unsupported models

**File**: `tests/providers/device-provider.test.ts` (NEW)

Tests for:
- Constructor validation
- Supported model acceptance
- Unsupported model rejection
- Error message content

### 8. Documentation

**File**: `docs/MODEL-SUPPORT.md` (NEW)

Comprehensive documentation covering:
- Overview of model support system
- List of supported models with capabilities
- API reference for all functions
- How to check model support
- How to add new models
- Error handling guide
- Best practices

### 9. Example Code

**File**: `examples/model-validation-example.ts` (NEW)

Demonstrates:
- Listing supported models
- Checking model support
- Getting model configuration
- Validating before session creation
- Handling configuration errors
- Dynamic model selection with fallback

## Benefits

### 1. Model Safety
- Prevents initialization of unsupported models
- Clear error messages guide users to supported models
- Validation happens early (at construction time)

### 2. Extensibility
- Easy to add new models with custom transformers
- Centralized configuration
- No need to modify worker code for new models

### 3. Maintainability
- Separated concerns: registry vs. worker logic
- Single source of truth for model support
- Easier to test and debug

### 4. Developer Experience
- Clear API for checking model support
- Helpful error messages with suggestions
- Type-safe transformer functions
- Comprehensive documentation

## Migration Guide

### For Existing Code

No breaking changes! Existing code will continue to work as before:

```typescript
// This still works exactly the same
const session = await createSession({
  models: [{
    type: 'device',
    model: 'onnx-community/Qwen3-0.6B-ONNX',
    quantization: 'q4',
    engine: 'webgpu'
  }]
});
```

### New Capabilities

You can now validate models before creating sessions:

```typescript
import { isSupportedModel, getSupportedModelIds } from 'agentary-js';

// Check support before creating session
if (isSupportedModel(userSelectedModel)) {
  // Create session
} else {
  console.log('Please choose from:', getSupportedModelIds());
}
```

### Error Handling

Catch configuration errors for better UX:

```typescript
try {
  const session = await createSession({
    models: [{ type: 'device', model: 'unsupported-model', ... }]
  });
} catch (error) {
  if (error instanceof ProviderConfigurationError) {
    // Handle unsupported model
    showModelSelectionUI(getSupportedModelIds());
  }
}
```

## Future Enhancements

Possible improvements:
1. Dynamic model registration API
2. Model capability detection at runtime
3. Transformer composition utilities
4. Support for custom tokenizer formats
5. Model recommendations based on use case

## Testing

All tests pass:
- ✅ 14 tests for model registry
- ✅ Constructor validation tests
- ✅ Message transformation tests
- ✅ Error handling tests
- ✅ Build successful

## Files Changed

### New Files
- `src/config/model-registry.ts`
- `src/config/index.ts`
- `tests/config/model-registry.test.ts`
- `tests/providers/device-provider.test.ts`
- `docs/MODEL-SUPPORT.md`
- `examples/model-validation-example.ts`

### Modified Files
- `src/types/worker.ts` - Added modelId to InitArgs
- `src/providers/device.ts` - Added validation and error handling
- `src/workers/worker.ts` - Made transformation configurable
- `src/index.ts` - Added new exports

## Breaking Changes

None. This is a fully backward-compatible enhancement.

