import { DeviceType } from "@huggingface/transformers";
import { WorkerManager } from "../workers/manager";
import { GenerateArgs, Model } from "./worker";
import { EventHandler, UnsubscribeFn } from "./events";

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
  /**
   * Subscribe to session events
   * @param eventType - Event type to listen for, or '*' for all events
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  on(eventType: string | '*', handler: EventHandler): UnsubscribeFn;
  /**
   * Unsubscribe from session events
   * @param eventType - Event type to unsubscribe from
   * @param handler - Event handler to remove
   */
  off(eventType: string | '*', handler: EventHandler): void;
}