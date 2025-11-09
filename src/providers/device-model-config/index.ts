/**
 * Model registry for device inference
 * 
 * This module provides model configurations and utilities for device-based inference.
 * Each model has its own configuration file with message transformers and response parsers.
 */

// Export types
export type { ModelConfig, MessageTransformer, ResponseParser } from './types';

// Export registry and utility functions
export {
  SUPPORTED_MODELS,
  isSupportedModel,
  getModelConfig,
  getSupportedModelIds,
  getMessageTransformer,
  getResponseParser,
} from './registry';

// Export individual model configurations for direct access if needed
export { qwen3_06b } from './models/qwen3';
