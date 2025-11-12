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

  verbose: {
    level: LogLevel.VERBOSE,
    enableColors: true,
    enableTimestamps: true,
    enableContextInfo: true,
    maxLogHistory: 3000,
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
 * Set the log level for the application
 * 
 * @param level - The log level to set (verbose, debug, info, warn, error, silent)
 * 
 * @example
 * ```typescript
 * import { setLogLevel } from './utils/logger-config';
 * 
 * setLogLevel('verbose'); // Enable verbose logging
 * setLogLevel('debug');   // Enable debug logging
 * setLogLevel('info');    // Enable info logging (default for production)
 * ```
 */
export function setLogLevel(level: LogLevel | string): void {
  // Import logger to avoid circular dependency issues
  const { logger } = require('./logger');
  
  const parseLogLevel = (level: string): LogLevel => {
    const normalizedLevel = level.toUpperCase();
    switch (normalizedLevel) {
      case 'VERBOSE': return LogLevel.VERBOSE;
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': case 'WARNING': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      case 'SILENT': case 'NONE': return LogLevel.SILENT;
      default: return LogLevel.INFO;
    }
  };

  const levelValue = typeof level === 'string' ? parseLogLevel(level) : level;
  const levelStr = typeof level === 'string' ? level.toLowerCase() : LogLevel[level].toLowerCase();
  
  // Set in logger instance
  logger.setLevel(levelValue);
  
  // Persist in browser
  if (typeof window !== 'undefined') {
    localStorage.setItem('agentary_log_level', levelStr);
  }
}

/**
 * Get the current log level
 * 
 * @returns The current log level enum value
 * 
 * @example
 * ```typescript
 * import { getLogLevel, LogLevel } from './utils/logger-config';
 * 
 * const currentLevel = getLogLevel();
 * if (currentLevel === LogLevel.VERBOSE) {
 *   console.log('Verbose logging is enabled');
 * }
 * ```
 */
export function getLogLevel(): LogLevel {
  const { logger } = require('./logger');
  return logger.getLevel();
}
