import { DataType, DeviceType } from "@huggingface/transformers";

export type EngineKind = DeviceType;
export type TaskType = 'chat' | 'function_calling';

export interface CreateSessionArgs {
  models?: {
    chat?: string;
    function_calling?: string;
  }
  adapters?: string[];
  ctx?: number;
  engine?: EngineKind;
  // Optional: Hugging Face access token for private models when using the
  // `hf:` model scheme. Ignored otherwise.
  hfToken?: string;
  quantization?: DataType;
}

export interface GenerateArgs {
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
  retrieval?: {
    queryFn?: (q: string, k: number) => Promise<string[]> | string[];
    k?: number;
  } | null;
}

export interface TokenStreamChunk {
  token: string;
  tokenId: number;
  isFirst: boolean;
  isLast: boolean;
  ttfbMs?: number;
  tokensPerSecond?: number;
}

export interface Session {
  generate(args: GenerateArgs): AsyncIterable<TokenStreamChunk>;
  dispose(): Promise<void>;
}