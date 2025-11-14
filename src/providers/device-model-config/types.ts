import { Message as HFMessage } from '@huggingface/transformers';
import { Message } from '../../types/worker';
import { NonStreamingResponse } from '../../types/session';

/**
 * Message transformer function type
 * Transforms Agentary messages to tokenizer-specific format
 */
export type MessageTransformer = (messages: Message[]) => HFMessage[];

/**
 * Response parser function type
 * Parses raw model output to extract tool calls, reasoning, and clean content
 */
export type ResponseParser = (content: string) => {
  content: string;
  toolCalls?: NonStreamingResponse['toolCalls'];
  finishReason?: NonStreamingResponse['finishReason'];
  reasoning?: string;
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
  /** Response parser function (optional, for models with custom output formats) */
  responseParser?: ResponseParser;
  /** Whether the model supports tool calling */
  toolSupport: boolean;
  /** Whether the model supports thinking/reasoning mode */
  reasoningSupport: boolean;
  /** Additional model-specific notes */
  notes?: string;
}
