import type { DeviceProviderConfig, InferenceProvider, InferenceProviderConfig } from '../types/provider';
import { ProviderConfigurationError } from '../types/provider';
import { EventEmitter } from '../utils/event-emitter';
import { logger } from '../utils/logger';

/**
 * Manages models and their associated inference providers
 */
export class InferenceProviderManager {
  private models: Map<string, InferenceProvider> = new Map();
  private eventEmitter: EventEmitter;

  constructor(eventEmitter: EventEmitter) {
    this.eventEmitter = eventEmitter;
  }

  async registerModels(models: Record<string, InferenceProviderConfig>): Promise<void> {
    for (const [name, config] of Object.entries(models)) {
      const inferenceProvider = await this.createProvider(name, config);
      this.models.set(name, inferenceProvider);
    }
  }

  /**
   * Get a provider for the given model
   */
  async getProvider(model: string): Promise<InferenceProvider> {
    logger.inferenceProviderManager?.debug('Getting provider', {
      model,
    });
    let provider = this.models.get(model);
    if (!provider) {
      throw new Error(`No model configuration found for: ${model}`);
    }
    return provider;
  }

  /**
   * Get all registered inference providers
   */
  getAllProviders(): Map<string, InferenceProvider> {
    return this.models;
  }

  /**
   * Create a provider instance based on type
   */
  private async createProvider(
    model: string,
    config: InferenceProviderConfig,
  ): Promise<InferenceProvider> {
    logger.inferenceProviderManager?.info('Creating inference provider', { model, config });

    let provider: InferenceProvider;

    switch (config.type) {
      case 'device': {
        const { DeviceProvider } = await import('./device');
        provider = new DeviceProvider(config as DeviceProviderConfig, this.eventEmitter);
        break;
      }
      // case 'cloud': {
      //   const { CloudProvider } = await import('./cloud');
      //   provider = new CloudProvider(config, this.eventEmitter);
      //   break;
      // }

      default:
        throw new ProviderConfigurationError(
          `Unknown provider type: ${config.type}`
        );
    }

    // Initialize the provider
    await provider.initialize();

    return provider;
  }

  /**
   * Dispose all providers and clean up resources
   */
  async disposeAll(): Promise<void> {
    logger.inferenceProviderManager?.info('Disposing all providers', {
      providerCount: this.models.size
    });

    const disposePromises = Array.from(this.models.values()).map(
      (provider) => provider.dispose()
    );

    await Promise.all(disposePromises);
    this.models.clear();

    logger.inferenceProviderManager?.info('All providers disposed successfully');
  }
}
