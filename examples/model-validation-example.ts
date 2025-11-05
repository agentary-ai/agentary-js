/**
 * Model Validation Example
 * 
 * This example demonstrates how to validate models before creating
 * a device provider, and how to handle unsupported models gracefully.
 */

import { 
  createSession, 
  isSupportedModel, 
  getSupportedModelIds, 
  getModelConfig,
  ProviderConfigurationError 
} from '../src/index';

async function main() {
  console.log('=== Model Validation Example ===\n');

  // 1. List all supported models
  console.log('1. Getting supported models:');
  const supportedModels = getSupportedModelIds();
  console.log('Supported models:', supportedModels);
  console.log();

  // 2. Check if a specific model is supported
  console.log('2. Checking model support:');
  const modelToCheck = 'onnx-community/Qwen3-0.6B-ONNX';
  const isSupported = isSupportedModel(modelToCheck);
  console.log(`Is "${modelToCheck}" supported?`, isSupported);
  
  const unsupportedModel = 'gpt-4';
  const isGpt4Supported = isSupportedModel(unsupportedModel);
  console.log(`Is "${unsupportedModel}" supported?`, isGpt4Supported);
  console.log();

  // 3. Get detailed model configuration
  console.log('3. Getting model configuration:');
  const modelConfig = getModelConfig(modelToCheck);
  console.log('Model details:', {
    id: modelConfig.modelId,
    name: modelConfig.displayName,
    supportsToolCalling: modelConfig.supportsToolCalling,
    supportsThinking: modelConfig.supportsThinking,
    notes: modelConfig.notes
  });
  console.log();

  // 4. Validate before creating session
  console.log('4. Creating session with validation:');
  const desiredModel = 'onnx-community/Qwen3-0.6B-ONNX';
  
  if (isSupportedModel(desiredModel)) {
    console.log(`✅ Model "${desiredModel}" is supported, creating session...`);
    
    try {
      const session = await createSession({
        models: [{
          type: 'device',
          model: desiredModel,
          quantization: 'q4',
          engine: 'webgpu'
        }]
      });
      console.log('Session created successfully!');
      console.log('Model name:', session.getModelName());
    } catch (error: any) {
      console.error('Failed to create session:', error.message);
    }
  } else {
    console.log(`❌ Model "${desiredModel}" is not supported`);
    console.log('Please choose from:', getSupportedModelIds());
  }
  console.log();

  // 5. Handle unsupported model error
  console.log('5. Handling unsupported model error:');
  try {
    const invalidSession = await createSession({
      models: [{
        type: 'device',
        model: 'unsupported-model',
        quantization: 'q4',
        engine: 'webgpu'
      }]
    });
  } catch (error: any) {
    if (error instanceof ProviderConfigurationError) {
      console.log('❌ Configuration Error caught:');
      console.log(error.message);
      console.log('\nSuggestion: Use one of the supported models:');
      getSupportedModelIds().forEach(model => {
        const config = getModelConfig(model);
        console.log(`  - ${config.displayName} (${model})`);
      });
    }
  }
  console.log();

  // 6. Dynamic model selection
  console.log('6. Dynamic model selection with fallback:');
  const preferredModels = [
    'user-preferred-model',
    'onnx-community/Qwen3-0.6B-ONNX', // fallback
  ];

  let selectedModel: string | null = null;
  for (const model of preferredModels) {
    if (isSupportedModel(model)) {
      selectedModel = model;
      console.log(`✅ Selected model: ${model}`);
      break;
    } else {
      console.log(`⏭️  Skipping unsupported model: ${model}`);
    }
  }

  if (selectedModel) {
    console.log(`Creating session with: ${selectedModel}`);
    // Create session with selected model...
  } else {
    console.log('❌ No supported model found in preferred list');
  }
  console.log();

  console.log('=== Example Complete ===');
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };

