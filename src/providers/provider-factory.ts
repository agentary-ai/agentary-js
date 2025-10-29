import {
  ModelProvider,
  ProviderConfig,
  IProviderFactory,
  LocalProviderConfig,
  OpenAIProviderConfig,
  AnthropicProviderConfig
} from "../types/provider";
import { Model } from "../types/worker";
import { LocalProvider } from "./local-provider";
import { logger } from "../utils/logger";

/**
 * Factory for creating model provider instances
 * Supports local (WebGPU/WASM) and API-based providers
 */
export class ProviderFactory implements IProviderFactory {
  /**
   * Create a provider instance from configuration
   */
  createProvider(config: ProviderConfig): ModelProvider {
    logger.providerFactory.debug('Creating provider', {
      type: config.type,
      model: config.model
    });

    switch (config.type) {
      case 'local':
        return this.createLocalProvider(config);

      case 'openai':
        return this.createOpenAIProvider(config);

      case 'anthropic':
        return this.createAnthropicProvider(config);

      default:
        throw new Error(`Unknown provider type: ${(config as any).type}`);
    }
  }

  /**
   * Create a provider from legacy model configuration
   * Maintains backward compatibility with existing model-based config
   */
  createFromLegacyModel(model: Model, engine?: string, hfToken?: string): ModelProvider {
    logger.providerFactory.debug('Creating provider from legacy model config', {
      modelName: model.name,
      quantization: model.quantization,
      engine
    });

    const localConfig: LocalProviderConfig = {
      type: 'local',
      model,
      engine: engine as any || 'auto',
      ...(hfToken !== undefined && { hfToken })
    };

    return this.createLocalProvider(localConfig);
  }

  /**
   * Create a local provider for WebGPU/WASM models
   */
  private createLocalProvider(config: LocalProviderConfig): ModelProvider {
    logger.providerFactory.info('Creating LocalProvider', {
      model: config.model.name,
      quantization: config.model.quantization,
      engine: config.engine
    });

    return new LocalProvider(config);
  }

  /**
   * Create an OpenAI API provider
   * @throws Error - Not yet implemented
   */
  private createOpenAIProvider(config: OpenAIProviderConfig): ModelProvider {
    logger.providerFactory.error('OpenAI provider not yet implemented', { config });
    throw new Error('OpenAI provider not yet implemented. Coming in Phase 2.');
  }

  /**
   * Create an Anthropic API provider
   * @throws Error - Not yet implemented
   */
  private createAnthropicProvider(config: AnthropicProviderConfig): ModelProvider {
    logger.providerFactory.error('Anthropic provider not yet implemented', { config });
    throw new Error('Anthropic provider not yet implemented. Coming in Phase 3.');
  }

  /**
   * Validate provider configuration
   * @throws Error if configuration is invalid
   */
  static validateConfig(config: ProviderConfig): void {
    if (!config.type) {
      throw new Error('Provider type is required');
    }

    switch (config.type) {
      case 'local':
        if (!config.model) {
          throw new Error('Local provider requires a model configuration');
        }
        if (!config.model.name) {
          throw new Error('Local provider model requires a name');
        }
        break;

      case 'openai':
        if (!config.apiKey) {
          throw new Error('OpenAI provider requires an API key');
        }
        if (!config.model) {
          throw new Error('OpenAI provider requires a model name');
        }
        break;

      case 'anthropic':
        if (!config.apiKey) {
          throw new Error('Anthropic provider requires an API key');
        }
        if (!config.model) {
          throw new Error('Anthropic provider requires a model name');
        }
        break;

      default:
        throw new Error(`Unknown provider type: ${(config as any).type}`);
    }
  }
}

// Export singleton instance
export const providerFactory = new ProviderFactory();
