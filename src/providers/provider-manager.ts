import { ModelProvider, ProviderSessionConfig } from "../types/provider";
import { GenerationTask } from "../types/session";
import { GenerateArgs, Model } from "../types/worker";
import { EventEmitter } from "../utils/event-emitter";
import { logger } from "../utils/logger";
import { providerFactory, ProviderFactory } from "./provider-factory";

/**
 * Manages model providers for a session
 * Handles provider creation, initialization, caching, and disposal
 * Supports both legacy model-based config and new provider-based config
 */
export class ProviderManager {
  private providers: Map<string, ModelProvider> = new Map();
  private readonly config: ProviderSessionConfig;
  private readonly eventEmitter: EventEmitter;
  private readonly factory: ProviderFactory;

  constructor(config: ProviderSessionConfig, eventEmitter: EventEmitter) {
    this.config = config;
    this.eventEmitter = eventEmitter;
    this.factory = providerFactory;
  }

  /**
   * Get a provider for the specified generation task
   * Creates and initializes the provider if it doesn't exist
   */
  async getProvider(_args: GenerateArgs, generationTask?: GenerationTask): Promise<ModelProvider> {
    // Determine which provider configuration to use
    const providerConfig = this.getProviderConfig(generationTask);
    const providerKey = this.getProviderKey(providerConfig, generationTask);

    logger.providerFactory.debug('Getting provider', {
      generationTask,
      providerKey,
      cached: this.providers.has(providerKey)
    });

    // Return cached provider if available
    let provider = this.providers.get(providerKey);

    if (!provider) {
      // Create new provider
      logger.providerFactory.info('Creating new provider instance', {
        generationTask,
        providerKey
      });

      provider = this.factory.createProvider(providerConfig);

      // Forward provider events to session event emitter
      this.forwardProviderEvents(provider);

      // Cache the provider
      this.providers.set(providerKey, provider);

      // Initialize the provider
      await provider.initialize();
    } else if (!provider.initialized) {
      // Provider exists but not initialized (shouldn't happen, but handle it)
      logger.providerFactory.warn('Provider exists but not initialized, initializing now', {
        generationTask,
        providerKey
      });
      await provider.initialize();
    }

    return provider;
  }

  /**
   * Dispose all providers and release resources
   */
  async disposeAll(): Promise<void> {
    logger.providerFactory.info('Disposing all providers', {
      providerCount: this.providers.size
    });

    const disposePromises: Promise<void>[] = [];

    for (const [key, provider] of this.providers) {
      if (!provider.disposed) {
        logger.providerFactory.debug('Disposing provider', { key });
        disposePromises.push(provider.dispose());
      }
    }

    await Promise.all(disposePromises);
    this.providers.clear();

    logger.providerFactory.info('All providers disposed successfully');
  }

  /**
   * Get provider configuration for a generation task
   * Handles both new provider-based config and legacy model-based config
   */
  private getProviderConfig(generationTask?: GenerationTask): any {
    // New provider-based configuration
    if (this.config.provider) {
      return this.config.provider;
    }

    // Multi-provider configuration
    if (this.config.providers) {
      switch (generationTask) {
        case 'tool_use':
          if (this.config.providers.tool_use) {
            return this.config.providers.tool_use;
          }
          break;
        case 'reasoning':
          if (this.config.providers.reasoning) {
            return this.config.providers.reasoning;
          }
          break;
        case 'chat':
          if (this.config.providers.chat) {
            return this.config.providers.chat;
          }
          break;
      }
    }

    // Legacy model-based configuration - convert to LocalProviderConfig
    const model = this.getLegacyModel(generationTask);
    return {
      type: 'local' as const,
      model,
      engine: this.config.engine || 'auto',
      hfToken: this.config.hfToken
    };
  }

  /**
   * Get model from legacy configuration
   * Maintains backward compatibility with existing model-based config
   */
  private getLegacyModel(generationTask?: GenerationTask): Model {
    const models = this.config.models;

    // Default model
    const defaultModel: Model = {
      name: 'onnx-community/Qwen3-0.6B-ONNX',
      quantization: 'q4f16'
    };

    if (!models) {
      return defaultModel;
    }

    switch (generationTask) {
      case 'tool_use':
        return models.tool_use || models.default || defaultModel;
      case 'reasoning':
        return models.reasoning || models.default || defaultModel;
      case 'chat':
        return models.chat || models.default || defaultModel;
      default:
        return models.default || defaultModel;
    }
  }

  /**
   * Generate a unique key for caching providers
   */
  private getProviderKey(providerConfig: any, generationTask?: GenerationTask): string {
    if (providerConfig.type === 'local') {
      return `local:${providerConfig.model.name}:${providerConfig.model.quantization || 'auto'}`;
    } else if (providerConfig.type === 'openai') {
      return `openai:${providerConfig.model}`;
    } else if (providerConfig.type === 'anthropic') {
      return `anthropic:${providerConfig.model}`;
    } else {
      return `unknown:${generationTask || 'default'}`;
    }
  }

  /**
   * Forward provider events to session event emitter
   * Maintains backward compatibility with existing event system
   */
  private forwardProviderEvents(provider: ModelProvider): void {
    // Forward all provider events to the session event emitter
    provider.events.on('*', (event) => {
      // Map provider events to session events for backward compatibility
      if (event.type === 'provider:init:start' && provider.type === 'local') {
        this.eventEmitter.emit({
          type: 'worker:init:start',
          modelName: event.model,
          timestamp: event.timestamp
        });
      } else if (event.type === 'provider:init:progress' && provider.type === 'local') {
        this.eventEmitter.emit({
          type: 'worker:init:progress',
          modelName: event.model,
          progress: event.progress,
          stage: event.stage,
          timestamp: event.timestamp
        });
      } else if (event.type === 'provider:init:complete' && provider.type === 'local') {
        this.eventEmitter.emit({
          type: 'worker:init:complete',
          modelName: event.model,
          duration: event.duration,
          timestamp: event.timestamp
        });
      }

      // Also emit the original provider event
      this.eventEmitter.emit(event);
    });
  }
}
