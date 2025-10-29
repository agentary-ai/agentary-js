import { EventEmitter } from "../utils/event-emitter";
import {
  ModelProvider,
  ProviderConfig,
  ProviderType,
  GenerationMetadata
} from "../types/provider";
import { GenerateArgs } from "../types/worker";
import { TokenStreamChunk } from "../types/session";

/**
 * Abstract base class for all model providers
 * Provides common functionality and enforces the ModelProvider interface
 */
export abstract class BaseProvider implements ModelProvider {
  public readonly type: ProviderType;
  public readonly config: ProviderConfig;
  public readonly events: EventEmitter;

  protected _initialized: boolean = false;
  protected _disposed: boolean = false;
  protected _lastMetadata: GenerationMetadata | null = null;

  constructor(config: ProviderConfig) {
    this.type = config.type;
    this.config = config;
    this.events = new EventEmitter();
  }

  get initialized(): boolean {
    return this._initialized;
  }

  get disposed(): boolean {
    return this._disposed;
  }

  /**
   * Initialize the provider
   * Must be implemented by subclasses
   */
  abstract initialize(): Promise<void>;

  /**
   * Generate a response stream
   * Must be implemented by subclasses
   */
  abstract generate(args: GenerateArgs): AsyncIterable<TokenStreamChunk>;

  /**
   * Get metadata from the last generation
   */
  getMetadata(): GenerationMetadata | null {
    return this._lastMetadata;
  }

  /**
   * Set metadata for the current generation
   */
  protected setMetadata(metadata: GenerationMetadata): void {
    this._lastMetadata = metadata;
  }

  /**
   * Clear metadata
   */
  protected clearMetadata(): void {
    this._lastMetadata = null;
  }

  /**
   * Dispose of provider resources
   * Must be implemented by subclasses
   */
  abstract dispose(): Promise<void>;

  /**
   * Check if provider is ready to use
   * @throws Error if provider is not initialized or is disposed
   */
  protected assertReady(): void {
    if (this._disposed) {
      throw new Error(`Provider ${this.type} has been disposed`);
    }
    if (!this._initialized) {
      throw new Error(`Provider ${this.type} has not been initialized`);
    }
  }

  /**
   * Check if provider is not yet disposed
   * @throws Error if provider is disposed
   */
  protected assertNotDisposed(): void {
    if (this._disposed) {
      throw new Error(`Provider ${this.type} has been disposed`);
    }
  }
}
