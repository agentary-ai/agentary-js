import type { GenerateArgs } from './worker';
import type { TokenStreamChunk } from './session';
import { DataType, DeviceType } from '@huggingface/transformers';

/**
 * Base interface for all inference providers (WebGPU, Cloud, etc.)
 */
export interface InferenceProvider {
  /**
   * Initialize the provider with configuration
   */
  initialize(): Promise<void>;

  /**
   * Generate a response with streaming
   * @param args Generation arguments
   */
  generate(
    args: GenerateArgs,
  ): AsyncIterable<TokenStreamChunk>;

  /**
   * Clean up resources
   */
  dispose(): Promise<void>;

  /**
   * Check if provider is initialized
   */
  isInitialized(): boolean;

  /**
   * Get the model name this provider is using
   */
  getModelName(): string;
}

/**
 * Configuration for inference providers
 */
export type InferenceProviderConfig = CloudProviderConfig | DeviceProviderConfig;

/**
 * Configuration for device providers
 */
export interface DeviceProviderConfig {
  type: 'device';
  model: string;
  quantization: DataType;
  engine?: DeviceType;
  hfToken?: string;
}

/**
 * Configuration for cloud providers
 */
export interface CloudProviderConfig {
  type: 'cloud';

  /**
   * URL of the user's backend proxy endpoint
   * Example: '/api/anthropic/messages' or 'https://my-backend.com/api/openai'
   */
  proxyUrl: string;

  /**
   * Model name to use
   */
  model: string;

  /**
   * Optional custom headers to send with requests
   */
  headers?: Record<string, string>;

  /**
   * Optional timeout in milliseconds (default: 60000)
   */
  timeout?: number;

  /**
   * Optional maximum number of retries for failed requests (default: 3)
   */
  maxRetries?: number;
}

/**
 * Standard error types for providers
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    // public readonly provider: ProviderType,
    public readonly code?: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class ProviderNetworkError extends ProviderError {
  constructor(originalError: Error) {
    super(
      `Network error: ${originalError.message}`,
      'NETWORK_ERROR'
    );
    this.name = 'ProviderNetworkError';
  }
}

export class ProviderTimeoutError extends ProviderError {
  constructor(timeout: number) {
    super(`Request timed out after ${timeout}ms`, 'TIMEOUT');
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderConfigurationError extends ProviderError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ProviderConfigurationError';
  }
}

export class ProviderAPIError extends ProviderError {
  constructor(
    message: string,
    statusCode: number,
    code?: string
  ) {
    super(message, code, statusCode);
    this.name = 'ProviderAPIError';
  }
}
