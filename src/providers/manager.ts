import type { DeviceProviderConfig, CloudProviderConfig, InferenceProvider, InferenceProviderConfig } from '../types/provider';
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

  async registerModels(models: InferenceProviderConfig[]): Promise<void> {
    logger.inferenceProviderManager?.debug('Registering models', { modelCount: models.length });
    for (const modelConfig of models) {
      const inferenceProvider = await this.createProvider(modelConfig.model, modelConfig);
      this.models.set(modelConfig.model, inferenceProvider);
    }
    logger.inferenceProviderManager?.info('Models registered successfully', { modelCount: models.length });
  }

  /**
   * Get a provider for the given model
   * 
   * @param model - The name of the model to get a provider for
   * @returns A promise that resolves to the inference provider
   */
  async getProvider(model: string): Promise<InferenceProvider> {
    let provider = this.models.get(model);
    if (!provider) {
      const provider = this.getAllProviders();
      throw new Error(`No model configuration found for: ${model}. Available models: ${Array.from(provider.keys()).join(', ')}`);
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
    logger.inferenceProviderManager?.debug('Creating inference provider', { model, config });

    let provider: InferenceProvider;

    switch (config.type) {
      case 'device': {
        const { DeviceProvider } = await import('./device');
        provider = new DeviceProvider(config as DeviceProviderConfig, this.eventEmitter);
        break;
      }
      case 'cloud': {
        const { CloudProvider } = await import('./cloud');
        provider = new CloudProvider(config as CloudProviderConfig, this.eventEmitter);
        break;
      }

      default:
        throw new ProviderConfigurationError(
          `Unknown provider type: ${(config as InferenceProviderConfig).type}`
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
