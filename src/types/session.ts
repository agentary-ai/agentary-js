import { DeviceType } from "@huggingface/transformers";
import { WorkerManager } from "../workers/manager";
import { GenerateArgs, Model } from "./worker";

export type GenerationTask = 'chat' | 'tool_use' | 'reasoning';

export interface CreateSessionArgs {
  models?: {
    default?: Model;
    tool_use?: Model;
    chat?: Model;
    reasoning?: Model;
  }
  ctx?: number;
  engine?: DeviceType;
  // Optional: Hugging Face access token for private models when using the
  // `hf:` model scheme. Ignored otherwise.
  hfToken?: string;
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
  workerManager: WorkerManager;
  createResponse(args: GenerateArgs, generationTask?: GenerationTask): AsyncIterable<TokenStreamChunk>;
  dispose(): Promise<void>;
}