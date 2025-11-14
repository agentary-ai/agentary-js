import { ModelConfig, MessageTransformer, ResponseParser } from './types';
import { qwen3_06b } from './models/qwen3';

/**
 * Registry of supported models for device inference
 * 
 * To add a new model:
 * 1. Create a new file in this directory (e.g., llama.ts)
 * 2. Define the model configuration with transformers and parsers
 * 3. Import and add it to this SUPPORTED_MODELS object
 */
export const SUPPORTED_MODELS: Record<string, ModelConfig> = {
  [qwen3_06b.modelId]: qwen3_06b,
};

/**
 * Check if a model is supported for device inference
 */
export function isSupportedModel(modelId: string): boolean {
  return modelId in SUPPORTED_MODELS;
}

/**
 * Get configuration for a supported model
 * @throws Error if model is not supported
 */
export function getModelConfig(modelId: string): ModelConfig {
  const config = SUPPORTED_MODELS[modelId];
  if (!config) {
    const supportedModelsList = Object.keys(SUPPORTED_MODELS).join(', ');
    throw new Error(
      `Model "${modelId}" is not supported for device inference. ` +
      `Supported models: ${supportedModelsList}`
    );
  }
  return config;
}

/**
 * Get list of all supported model IDs
 */
export function getSupportedModelIds(): string[] {
  return Object.keys(SUPPORTED_MODELS);
}

/**
 * Get message transformer for a model
 * @throws Error if model is not supported
 */
export function getMessageTransformer(modelId: string): MessageTransformer {
  return getModelConfig(modelId).messageTransformer;
}

/**
 * Get response parser for a model
 * @throws Error if model is not supported
 * @returns Response parser function or undefined if model doesn't have one
 */
export function getResponseParser(modelId: string): ResponseParser | undefined {
  return getModelConfig(modelId).responseParser;
}
