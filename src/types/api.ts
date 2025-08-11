export type EngineKind = 'auto' | 'webgpu' | 'wasm' | 'webnn';

export interface CreateSessionArgs {
  model: string; // e.g. "q4_0/1.5B"
  adapters?: string[];
  ctx?: number;
  engine?: EngineKind;
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


