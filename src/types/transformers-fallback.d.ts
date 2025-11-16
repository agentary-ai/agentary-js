/**
 * Fallback type definitions for @huggingface/transformers
 * These are used when the package is not installed (peer dependency)
 */

declare module '@huggingface/transformers' {
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
    tokenizer: any;
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
    constructor(tokenizer: any, options?: any);
  }

  export function pipeline(
    task: string,
    model: string,
    options?: any
  ): Promise<any>;

  export const env: {
    HF_TOKEN?: string;
    [key: string]: any;
  };
}
