import { EventEmitter } from "../utils/event-emitter";
import { GenerateArgs, Model } from "./worker";
import { TokenStreamChunk, GenerationTask } from "./session";

/**
 * Provider type discriminator
 */
export type ProviderType = 'local' | 'openai' | 'anthropic';

/**
 * Base configuration for all providers
 */
export interface BaseProviderConfig {
  type: ProviderType;
  model?: Model | string; // Provider-specific model name
}

/**
 * Configuration for local (WebGPU/WASM) providers
 */
export interface LocalProviderConfig extends BaseProviderConfig {
  type: 'local';
  model: Model; // Hugging Face model with quantization
  engine?: 'auto' | 'webgpu' | 'wasm' | 'webnn';
  hfToken?: string;
}

/**
 * Configuration for OpenAI-compatible API providers
 */
export interface OpenAIProviderConfig extends BaseProviderConfig {
  type: 'openai';
  apiKey: string;
  model: string; // e.g., 'gpt-4o', 'gpt-4o-mini'
  baseURL?: string; // For OpenAI-compatible APIs (Groq, Together, etc.)
  organization?: string;
  maxRetries?: number;
}

/**
 * Configuration for Anthropic Claude API provider
 */
export interface AnthropicProviderConfig extends BaseProviderConfig {
  type: 'anthropic';
  apiKey: string;
  model: string; // e.g., 'claude-3-5-sonnet-20241022'
  maxRetries?: number;
}

/**
 * Union type of all provider configurations
 */
export type ProviderConfig = LocalProviderConfig | OpenAIProviderConfig | AnthropicProviderConfig;

/**
 * Token usage statistics from API providers
 */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cache_creation_tokens?: number; // Anthropic prompt caching
  cache_read_tokens?: number; // Anthropic prompt caching
}

/**
 * Generation response metadata
 */
export interface GenerationMetadata {
  model?: string;
  usage?: TokenUsage;
  finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  ttfbMs?: number;
}

/**
 * Core interface that all model providers must implement
 */
export interface ModelProvider {
  /**
   * Provider type identifier
   */
  readonly type: ProviderType;

  /**
   * Provider configuration
   */
  readonly config: ProviderConfig;

  /**
   * Event emitter for provider events
   */
  readonly events: EventEmitter;

  /**
   * Whether the provider has been initialized
   */
  readonly initialized: boolean;

  /**
   * Whether the provider has been disposed
   */
  readonly disposed: boolean;

  /**
   * Initialize the provider
   * For local providers: downloads and loads the model
   * For API providers: validates credentials and connectivity
   */
  initialize(): Promise<void>;

  /**
   * Generate a response stream
   * @param args - Generation arguments including messages, tools, etc.
   * @returns Async iterable of token chunks
   */
  generate(args: GenerateArgs): AsyncIterable<TokenStreamChunk>;

  /**
   * Get metadata from the last generation
   * @returns Generation metadata including usage statistics
   */
  getMetadata(): GenerationMetadata | null;

  /**
   * Dispose of provider resources
   * For local providers: terminates worker and releases memory
   * For API providers: cleans up connections
   */
  dispose(): Promise<void>;
}

/**
 * Extended session configuration supporting both legacy models and new providers
 */
export interface ProviderSessionConfig {
  // New provider-based configuration
  provider?: ProviderConfig;

  // Multi-provider configuration (advanced usage)
  // TODO: Support custom provider types/names?
  providers?: {
    chat?: ProviderConfig;
    tool_use?: ProviderConfig;
    reasoning?: ProviderConfig;
  };

  // Legacy model-based configuration (for backward compatibility)
  models?: {
    default?: Model;
    tool_use?: Model;
    chat?: Model;
    reasoning?: Model;
  };

  // Legacy options
  ctx?: number;
  engine?: 'auto' | 'webgpu' | 'wasm' | 'webnn';
  hfToken?: string;
}

/**
 * Provider factory interface
 */
export interface IProviderFactory {
  /**
   * Create a provider instance from configuration
   */
  createProvider(config: ProviderConfig): ModelProvider;

  /**
   * Create a provider from legacy model configuration
   */
  createFromLegacyModel(model: Model, engine?: string, hfToken?: string): ModelProvider;
}
