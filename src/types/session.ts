import { GenerateArgs } from "./worker";
import { EventHandler, UnsubscribeFn } from "./events";
import { InferenceProviderConfig } from "./provider";

// export type GenerationTask = 'chat' | 'tool_use' | 'reasoning';

export interface CreateSessionArgs {
  models?: Record<string, InferenceProviderConfig>;
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
  createResponse(args: GenerateArgs): AsyncIterable<TokenStreamChunk>;
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