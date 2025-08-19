import { DataType } from "@huggingface/transformers";

export type EngineKind = 'auto' | 'webgpu' | 'wasm' | 'webnn';

export interface InitMessage {
  type: 'init';
  requestId: string;
  args: {
    model: string;
    adapters?: string[];
    ctx?: number;
    engine?: EngineKind;
    hfToken?: string;
    quantization?: DataType
  };
}

export interface GenerateMessage {
  type: 'generate';
  requestId: string;
  args: {
    prompt?: string;
    system?: string;
    tools?: unknown[];
    stop?: string[];
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repetition_penalty?: number;
    seed?: number;
    deterministic?: boolean;
  };
}

export interface DisposeMessage {
  type: 'dispose';
  requestId: string;
}

export type InboundMessage = InitMessage | GenerateMessage | DisposeMessage;

export interface ChunkMessage {
  type: 'chunk';
  requestId: string;
  payload: {
    token: string;
    tokenId: number;
    isFirst: boolean;
    isLast: boolean;
    ttfbMs?: number;
  };
}

export interface AckMessage {
  type: 'ack';
  requestId: string;
}

export interface DoneMessage {
  type: 'done';
  requestId: string;
}

export interface ErrorMessage {
  type: 'error';
  requestId: string;
  error: string;
}

export interface DebugMessage {
  type: 'debug';
  requestId: string;
  payload: {
    message: string;
    data?: unknown;
  };
}

export type OutboundMessage = ChunkMessage | AckMessage | DoneMessage | ErrorMessage | DebugMessage;
