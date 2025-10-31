/**
 * Configuration utilities for the Agentary.js logger
 */

import { LogLevel, type LoggerConfig } from './logger';

/**
 * Default logging configurations for different environments
 */
export const LogConfigs = {
  production: {
    level: LogLevel.WARN,
    enableColors: false,
    enableTimestamps: true,
    enableContextInfo: false,
    maxLogHistory: 500,
  } as Partial<LoggerConfig>,

  development: {
    level: LogLevel.DEBUG,
    enableColors: true,
    enableTimestamps: true,
    enableContextInfo: true,
    maxLogHistory: 1000,
  } as Partial<LoggerConfig>,

  testing: {
    level: LogLevel.ERROR,
    enableColors: false,
    enableTimestamps: false,
    enableContextInfo: false,
    maxLogHistory: 100,
  } as Partial<LoggerConfig>,

  debugging: {
    level: LogLevel.DEBUG,
    enableColors: true,
    enableTimestamps: true,
    enableContextInfo: true,
    maxLogHistory: 2000,
    customFormatters: {
      'worker': (entry) => `🔧 [WORKER] ${entry.message} ${entry.data ? JSON.stringify(entry.data) : ''}`,
      'worker-manager': (entry) => `🔧 [WORKER-MANAGER] ${entry.message} ${entry.data ? JSON.stringify(entry.data) : ''}`,
      'session': (entry) => `💬 [SESSION] ${entry.message} ${entry.data ? JSON.stringify(entry.data) : ''}`,
      'agent': (entry) => `🤖 [AGENT] ${entry.message} ${entry.data ? JSON.stringify(entry.data) : ''}`,
      'performance': (entry) => `⚡ [PERF] ${entry.message} ${entry.data ? JSON.stringify(entry.data) : ''}`,
      'providerManager': (entry) => `🔌 [PROVIDER-MANAGER] ${entry.message} ${entry.data ? JSON.stringify(entry.data) : ''}`,
      'webgpuProvider': (entry) => `🎮 [WEBGPU] ${entry.message} ${entry.data ? JSON.stringify(entry.data) : ''}`,
      'cloudProvider': (entry) => `☁️  [CLOUD] ${entry.message} ${entry.data ? JSON.stringify(entry.data) : ''}`,
      'anthropicProvider': (entry) => `🤖 [ANTHROPIC] ${entry.message} ${entry.data ? JSON.stringify(entry.data) : ''}`,
      'openaiProvider': (entry) => `🔮 [OPENAI] ${entry.message} ${entry.data ? JSON.stringify(entry.data) : ''}`,
    }
  } as Partial<LoggerConfig>,
};

/**
 * Get environment-appropriate logging configuration
 */
export function getEnvironmentConfig(): Partial<LoggerConfig> {
  // Browser environment
  if (typeof window !== 'undefined') {
    const isDev = window.location.hostname === 'localhost' || 
                  window.location.hostname.includes('127.0.0.1') ||
                  window.location.search.includes('debug=true');
    
    return isDev ? LogConfigs.development : LogConfigs.production;
  }
  
  // Node.js environment
  if (typeof process !== 'undefined' && process.env) {
    const nodeEnv = process.env.NODE_ENV?.toLowerCase();
    
    switch (nodeEnv) {
      case 'production':
        return LogConfigs.production;
      case 'test':
      case 'testing':
        return LogConfigs.testing;
      case 'development':
      case 'dev':
        return LogConfigs.development;
      default:
        return LogConfigs.development;
    }
  }
  
  // Default to development config
  return LogConfigs.development;
}

/**
 * Enable enhanced debugging mode
 * Useful for debugging complex workflows or worker interactions
 */
export function enableDebuggingMode(): void {
  if (typeof window !== 'undefined') {
    (window as any).agentaryDebug = true;
    localStorage.setItem('agentary_log_level', 'debug');
  }
}

/**
 * Disable debugging mode
 */
export function disableDebuggingMode(): void {
  if (typeof window !== 'undefined') {
    (window as any).agentaryDebug = false;
    localStorage.removeItem('agentary_log_level');
  }
}

/**
 * Check if debugging mode is enabled
 */
export function isDebuggingMode(): boolean {
  if (typeof window !== 'undefined') {
    return !!(window as any).agentaryDebug || 
           localStorage.getItem('agentary_log_level') === 'debug';
  }
  return false;
}
