/**
 * Mock implementation of @huggingface/transformers for testing
 * This allows tests to run without requiring the actual package to be installed
 */

import { vi } from 'vitest';

export type DataType =
  | 'fp32'
  | 'fp16'
  | 'q8'
  | 'int8'
  | 'uint8'
  | 'q4'
  | 'bnb4'
  | 'q4f16'
  | 'auto';

export type DeviceType =
  | 'auto'
  | 'webgpu'
  | 'wasm'
  | 'webnn';

export interface Message {
  role: string;
  content: string | any[];
}

export interface TextGenerationPipeline {
  (text: string, options?: any): Promise<any>;
  tokenizer: {
    apply_chat_template: vi.Mock;
  };
  dispose?: () => Promise<void>;
}

export interface TextGenerationConfig {
  max_new_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  do_sample?: boolean;
  repetition_penalty?: number;
  stop?: string[];
}

export interface ProgressInfo {
  status: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

export class TextStreamer {
  constructor(tokenizer: any, options?: any) {
    // Mock implementation
  }
}

export const pipeline = vi.fn(async (task: string, model: string, options?: any): Promise<TextGenerationPipeline> => {
  const mockPipeline = vi.fn().mockResolvedValue({
    generated_text: 'Mock response'
  }) as any;

  mockPipeline.tokenizer = {
    apply_chat_template: vi.fn((messages: any[], options: any) => {
      return 'Mock rendered prompt';
    })
  };

  mockPipeline.dispose = vi.fn().mockResolvedValue(undefined);

  return mockPipeline;
});

export const env = {
  HF_TOKEN: undefined as string | undefined,
};
