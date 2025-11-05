import { Message as HFMessage } from '@huggingface/transformers';
import { Message, ToolUseContent, ToolResultContent, TextContent } from '../types/worker';

/**
 * Message transformer function type
 * Transforms Agentary messages to tokenizer-specific format
 */
export type MessageTransformer = (messages: Message[]) => HFMessage[];

/**
 * Default message transformer for Qwen models
 * Supports text, tool_use, and tool_result content types
 */
export const qwenMessageTransformer: MessageTransformer = (messages: Message[]) => {
  return messages.flatMap(message => {
    if (Array.isArray(message.content)) {
      return message.content.map(content => {
        switch (content.type) {
          case 'text':
            return {
              role: message.role,
              content: content.text,
            } as HFMessage;
          case 'tool_use':
            return {
              role: message.role,
              content: '',
              tool_calls: [{
                type: 'function',
                function: {
                  name: content.name,
                  arguments: content.arguments,
                },
              }],
            } as HFMessage;
          case 'tool_result':
            return {
              role: 'tool',
              content: content.result,
            } as HFMessage;
          default:
            throw new Error(`Unsupported content type: ${(content as any).type}`);
        }
      });
    }
    return {
      role: message.role,
      content: message.content as string,
    } as HFMessage;
  });
};

/**
 * Model configuration interface
 */
export interface ModelConfig {
  /** Model identifier (e.g., "onnx-community/Qwen3-0.6B-ONNX") */
  modelId: string;
  /** Human-readable model name */
  displayName: string;
  /** Message transformer function */
  messageTransformer: MessageTransformer;
  /** Whether the model supports tool calling */
  supportsToolCalling: boolean;
  /** Whether the model supports thinking/reasoning mode */
  supportsThinking: boolean;
  /** Additional model-specific notes */
  notes?: string;
}

/**
 * Registry of supported models for device inference
 */
export const SUPPORTED_MODELS: Record<string, ModelConfig> = {
  'onnx-community/Qwen3-0.6B-ONNX': {
    modelId: 'onnx-community/Qwen3-0.6B-ONNX',
    displayName: 'Qwen3 0.6B (ONNX)',
    messageTransformer: qwenMessageTransformer,
    supportsToolCalling: true,
    supportsThinking: true,
    notes: 'Lightweight model optimized for on-device inference',
  },
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

