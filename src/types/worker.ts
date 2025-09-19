import { DataType } from "@huggingface/transformers";
import { Model } from "./api";

export type EngineKind = 'auto' | 'webgpu' | 'wasm' | 'webnn';

export interface InitArgs {
  model: string;
  engine?: EngineKind;
  hfToken?: string;
  quantization?: DataType;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface GenerateArgs {
  model?: Model;
  messages: Message[];
  max_new_tokens?: number;
  tools?: unknown[];
  stop?: string[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
  seed?: number;
  deterministic?: boolean;
}

export type InboundMessageType = 'init' | 'generate' | 'dispose';

export type InboundMessage = {
  type: InboundMessageType;
  requestId: string;
  args?: InitArgs | GenerateArgs;
}

export interface ErrorArgs {
  error: string;
}

export interface DebugArgs {
  message: string;
  data?: unknown;
}

export interface ChunkArgs {
  token: string;
  tokenId: number;
  isFirst: boolean;
  isLast: boolean;
  ttfbMs?: number;
}

export type OutboundMessageType = 'chunk' | 'ack' | 'done' | 'error' | 'debug';

export type OutboundMessage = {
  type: OutboundMessageType;
  requestId: string;
  args?: ChunkArgs | ErrorArgs | DebugArgs;
}