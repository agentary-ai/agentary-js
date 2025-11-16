/**
 * Re-exported types from external dependencies
 * This allows TypeScript to work without requiring peer dependencies to be installed
 */

// Re-export Transformers.js types
// These will be available when the package is installed
// If not installed, TypeScript will use the fallback definitions below
export type {
  DataType,
  DeviceType,
  Message,
  TextGenerationPipeline,
  TextGenerationConfig,
  ProgressInfo,
  TextStreamer
} from '@huggingface/transformers';
