import { DeviceType } from "@huggingface/transformers";
import { GenerateArgs, Model } from "./worker";
import { EventHandler, UnsubscribeFn } from "./events";
import { ProviderSessionConfig } from "./provider";

export type GenerationTask = 'chat' | 'tool_use' | 'reasoning';

// Legacy CreateSessionArgs for backward compatibility
export interface CreateSessionArgs extends ProviderSessionConfig {}

export interface TokenStreamChunk {
  token: string;
  tokenId: number;
  isFirst: boolean;
  isLast: boolean;
  ttfbMs?: number;
  tokensPerSecond?: number;
}

export interface Session {
  // Legacy property for backward compatibility
  // Will be removed in v2.0
  workerManager?: any;

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