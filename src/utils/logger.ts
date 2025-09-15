/**
 * Centralized logging utility for Agentary.js
 * Provides structured logging with levels, formatting, and environment-based configuration
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
  requestId?: string;
  context?: Record<string, unknown>;
}

export interface LoggerConfig {
  level: LogLevel;
  enableColors: boolean;
  enableTimestamps: boolean;
  enableContextInfo: boolean;
  maxLogHistory: number;
  customFormatters?: {
    [category: string]: (entry: LogEntry) => string;
  };
}

class Logger {
  private config: LoggerConfig;
  private logHistory: LogEntry[] = [];
  private static instance: Logger;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: this.getLogLevelFromEnvironment(),
      enableColors: this.isColorsSupported(),
      enableTimestamps: true,
      enableContextInfo: true,
      maxLogHistory: 1000,
      ...config,
    };
  }

  static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  private getLogLevelFromEnvironment(): LogLevel {
    if (typeof window !== 'undefined') {
      // Browser environment
      const urlParams = new URLSearchParams(window.location.search);
      const logLevel = urlParams.get('logLevel') || localStorage.getItem('agentary_log_level');
      if (logLevel) {
        return this.parseLogLevel(logLevel);
      }
    }
    
    if (typeof process !== 'undefined' && process.env) {
      // Node.js environment
      const logLevel = process.env.AGENTARY_LOG_LEVEL;
      if (logLevel) {
        return this.parseLogLevel(logLevel);
      }
    }

    // Default to INFO in production, DEBUG in development
    return typeof process !== 'undefined' && process.env.NODE_ENV === 'production' 
      ? LogLevel.INFO 
      : LogLevel.DEBUG;
  }

  private parseLogLevel(level: string): LogLevel {
    const normalizedLevel = level.toUpperCase();
    switch (normalizedLevel) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': case 'WARNING': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      case 'SILENT': case 'NONE': return LogLevel.SILENT;
      default: return LogLevel.INFO;
    }
  }

  private isColorsSupported(): boolean {
    // Check if we're in a browser environment (main thread or worker)
    if (typeof window !== 'undefined') {
      return true; // Main browser thread supports colors
    }
    
    // Check if we're in a web worker
    if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined') {
      return true; // Web workers also support console colors in modern browsers
    }
    
    // Node.js or other environments - could check for terminal color support here
    // For now, disable colors in non-browser environments
    return false;
  }

  private formatTimestamp(): string {
    const now = new Date();
    return now.toISOString();
  }

  private getLevelName(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return 'DEBUG';
      case LogLevel.INFO: return 'INFO';
      case LogLevel.WARN: return 'WARN';
      case LogLevel.ERROR: return 'ERROR';
      default: return 'UNKNOWN';
    }
  }

  private getLevelColor(level: LogLevel): string {
    if (!this.config.enableColors) return '';
    
    switch (level) {
      case LogLevel.DEBUG: return 'color: #888';
      case LogLevel.INFO: return 'color: #007acc';
      case LogLevel.WARN: return 'color: #ff9500';
      case LogLevel.ERROR: return 'color: #e74c3c';
      default: return '';
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    const { level, category, message, data, requestId, context } = entry;
    
    // Check for custom formatter
    if (this.config.customFormatters?.[category]) {
      return this.config.customFormatters[category](entry);
    }

    let formatted = '';
    
    if (this.config.enableTimestamps) {
      formatted += `[${this.formatTimestamp()}] `;
    }
    
    formatted += `[${this.getLevelName(level)}]`;
    
    if (category) {
      formatted += ` [${category}]`;
    }
    
    if (requestId) {
      formatted += ` [req:${requestId}]`;
    }
    
    formatted += ` ${message}`;
    
    if (data !== undefined) {
      formatted += ` ${JSON.stringify(data)}`;
    }
    
    if (this.config.enableContextInfo && context && Object.keys(context).length > 0) {
      formatted += ` | Context: ${JSON.stringify(context)}`;
    }
    
    return formatted;
  }

  private log(level: LogLevel, category: string, message: string, data?: unknown, options?: {
    requestId?: string;
    context?: Record<string, unknown>;
  }): void {
    if (level < this.config.level) {
      return; // Log level too low
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
      data,
      ...(options?.requestId !== undefined && { requestId: options.requestId }),
      ...(options?.context !== undefined && { context: options.context }),
    };

    // Add to history
    this.logHistory.push(entry);
    if (this.logHistory.length > this.config.maxLogHistory) {
      this.logHistory.shift();
    }

    // Format and output
    const formatted = this.formatLogEntry(entry);
    const color = this.getLevelColor(level);

    if (this.config.enableColors && color) {
      switch (level) {
        case LogLevel.DEBUG:
          console.log(`%c${formatted}`, color);
          break;
        case LogLevel.INFO:
          console.info(`%c${formatted}`, color);
          break;
        case LogLevel.WARN:
          console.warn(`%c${formatted}`, color);
          break;
        case LogLevel.ERROR:
          console.error(`%c${formatted}`, color);
          break;
      }
    } else {
      switch (level) {
        case LogLevel.DEBUG:
          console.log(formatted);
          break;
        case LogLevel.INFO:
          console.info(formatted);
          break;
        case LogLevel.WARN:
          console.warn(formatted);
          break;
        case LogLevel.ERROR:
          console.error(formatted);
          break;
      }
    }
  }

  debug(category: string, message: string, data?: unknown, options?: {
    requestId?: string;
    context?: Record<string, unknown>;
  }): void {
    this.log(LogLevel.DEBUG, category, message, data, options);
  }

  info(category: string, message: string, data?: unknown, options?: {
    requestId?: string;
    context?: Record<string, unknown>;
  }): void {
    this.log(LogLevel.INFO, category, message, data, options);
  }

  warn(category: string, message: string, data?: unknown, options?: {
    requestId?: string;
    context?: Record<string, unknown>;
  }): void {
    this.log(LogLevel.WARN, category, message, data, options);
  }

  error(category: string, message: string, data?: unknown, options?: {
    requestId?: string;
    context?: Record<string, unknown>;
  }): void {
    this.log(LogLevel.ERROR, category, message, data, options);
  }

  // Convenience methods for common categories
  worker = {
    debug: (message: string, data?: unknown, requestId?: string) => 
      this.debug('worker', message, data, requestId ? { requestId } : undefined),
    info: (message: string, data?: unknown, requestId?: string) => 
      this.info('worker', message, data, requestId ? { requestId } : undefined),
    warn: (message: string, data?: unknown, requestId?: string) => 
      this.warn('worker', message, data, requestId ? { requestId } : undefined),
    error: (message: string, data?: unknown, requestId?: string) => 
      this.error('worker', message, data, requestId ? { requestId } : undefined),
  };

  session = {
    debug: (message: string, data?: unknown, requestId?: string) => 
      this.debug('session', message, data, requestId ? { requestId } : undefined),
    info: (message: string, data?: unknown, requestId?: string) => 
      this.info('session', message, data, requestId ? { requestId } : undefined),
    warn: (message: string, data?: unknown, requestId?: string) => 
      this.warn('session', message, data, requestId ? { requestId } : undefined),
    error: (message: string, data?: unknown, requestId?: string) => 
      this.error('session', message, data, requestId ? { requestId } : undefined),
  };

  agent = {
    debug: (message: string, data?: unknown, context?: Record<string, unknown>) => 
      this.debug('agent', message, data, context ? { context } : undefined),
    info: (message: string, data?: unknown, context?: Record<string, unknown>) => 
      this.info('agent', message, data, context ? { context } : undefined),
    warn: (message: string, data?: unknown, context?: Record<string, unknown>) => 
      this.warn('agent', message, data, context ? { context } : undefined),
    error: (message: string, data?: unknown, context?: Record<string, unknown>) => 
      this.error('agent', message, data, context ? { context } : undefined),
  };

  workerManager = {
    debug: (message: string, data?: unknown, requestId?: string) => 
      this.debug('worker-manager', message, data, requestId ? { requestId } : undefined),
    info: (message: string, data?: unknown, requestId?: string) => 
      this.info('worker-manager', message, data, requestId ? { requestId } : undefined),
    warn: (message: string, data?: unknown, requestId?: string) => 
      this.warn('worker-manager', message, data, requestId ? { requestId } : undefined),
    error: (message: string, data?: unknown, requestId?: string) => 
      this.error('worker-manager', message, data, requestId ? { requestId } : undefined),
  };

  performance = {
    debug: (message: string, data?: unknown, context?: Record<string, unknown>) => 
      this.debug('performance', message, data, context ? { context } : undefined),
    info: (message: string, data?: unknown, context?: Record<string, unknown>) => 
      this.info('performance', message, data, context ? { context } : undefined),
  };

  // Utility methods
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  getLevel(): LogLevel {
    return this.config.level;
  }

  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getLogHistory(): LogEntry[] {
    return [...this.logHistory];
  }

  clearHistory(): void {
    this.logHistory = [];
  }

  // Export logs for debugging
  exportLogs(): string {
    return this.logHistory
      .map(entry => this.formatLogEntry(entry))
      .join('\n');
  }
}

// Create and export default logger instance
export const logger = Logger.getInstance();

// Export factory function for custom loggers
export function createLogger(config?: Partial<LoggerConfig>): Logger {
  return new Logger(config);
}

// Helper to set global log level via URL or localStorage (browser only)
export function setGlobalLogLevel(level: LogLevel | string): void {
  const parseLogLevel = (level: string): LogLevel => {
    const normalizedLevel = level.toUpperCase();
    switch (normalizedLevel) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': case 'WARNING': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      case 'SILENT': case 'NONE': return LogLevel.SILENT;
      default: return LogLevel.INFO;
    }
  };

  if (typeof window !== 'undefined') {
    const levelStr = typeof level === 'string' ? level : LogLevel[level].toLowerCase();
    localStorage.setItem('agentary_log_level', levelStr);
    logger.setLevel(typeof level === 'string' ? parseLogLevel(level) : level);
  } else {
    // For non-browser environments (like tests), just set the level directly
    logger.setLevel(typeof level === 'string' ? parseLogLevel(level) : level);
  }
}
