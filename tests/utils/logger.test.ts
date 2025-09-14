import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logger, createLogger, LogLevel, setGlobalLogLevel } from '../../src/utils/logger'

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Logging', () => {
    it('should log messages with different levels', () => {
      const consoleSpy = vi.spyOn(console, 'info')
      
      logger.info('test', 'Test message')
      
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should use predefined category loggers', () => {
      const infoSpy = vi.spyOn(console, 'info')
      const logSpy = vi.spyOn(console, 'log') // debug uses console.log
      const warnSpy = vi.spyOn(console, 'warn')
      
      logger.session.info('Session created')
      logger.worker.debug('Worker initialized')
      logger.agent.warn('Step timeout')
      
      expect(infoSpy).toHaveBeenCalledTimes(1)
      expect(logSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })

    it('should include request ID when provided', () => {
      const consoleSpy = vi.spyOn(console, 'info')
      
      logger.session.info('Test message', { data: 'test' }, 'req-123')
      
      expect(consoleSpy).toHaveBeenCalled()
      const logCall = consoleSpy.mock.calls[0][0]
      expect(logCall).toContain('req-123')
    })
  })

  describe('Log Levels', () => {
    it('should respect log level filtering', () => {
      const warnSpy = vi.spyOn(console, 'warn')
      const customLogger = createLogger({ level: LogLevel.WARN })
      
      customLogger.debug('test', 'Debug message')
      customLogger.info('test', 'Info message')
      customLogger.warn('test', 'Warning message')
      
      // Only WARN level and above should be logged
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })

    it('should allow changing global log level', () => {
      const errorSpy = vi.spyOn(console, 'error')
      
      setGlobalLogLevel(LogLevel.ERROR)
      
      logger.info('test', 'Info message')
      logger.error('test', 'Error message')
      
      // Only ERROR level should be logged
      expect(errorSpy).toHaveBeenCalledTimes(1)
      
      // Reset for other tests
      setGlobalLogLevel(LogLevel.DEBUG)
    })
  })

  describe('Log History', () => {
    it('should maintain log history', () => {
      const customLogger = createLogger({ maxLogHistory: 100 })
      
      customLogger.info('test', 'Message 1')
      customLogger.info('test', 'Message 2')
      
      const history = customLogger.getLogHistory()
      
      expect(history).toHaveLength(2)
      expect(history[0].message).toBe('Message 1')
      expect(history[1].message).toBe('Message 2')
    })

    it('should limit log history size', () => {
      const customLogger = createLogger({ maxLogHistory: 2 })
      
      customLogger.info('test', 'Message 1')
      customLogger.info('test', 'Message 2')
      customLogger.info('test', 'Message 3')
      
      const history = customLogger.getLogHistory()
      
      expect(history).toHaveLength(2)
      expect(history[0].message).toBe('Message 2')
      expect(history[1].message).toBe('Message 3')
    })

    it('should clear log history', () => {
      const customLogger = createLogger({ maxLogHistory: 100 })
      
      customLogger.info('test', 'Message 1')
      customLogger.clearHistory()
      
      const history = customLogger.getLogHistory()
      
      expect(history).toHaveLength(0)
    })
  })

  describe('Log Export', () => {
    it('should export logs as text', () => {
      const customLogger = createLogger({ 
        maxLogHistory: 100,
        enableTimestamps: false // Disable for consistent testing
      })
      
      customLogger.info('test', 'Test message', { data: 'value' })
      
      const exported = customLogger.exportLogs()
      
      expect(exported).toContain('Test message')
      expect(exported).toContain('test')
    })
  })

  describe('Custom Formatters', () => {
    it('should use custom formatters when provided', () => {
      const consoleSpy = vi.spyOn(console, 'info')
      
      const customLogger = createLogger({
        customFormatters: {
          'performance': (entry) => `⚡ PERF: ${entry.message}`
        }
      })
      
      customLogger.performance.info('Model loaded')
      
      expect(consoleSpy).toHaveBeenCalled()
      const logCall = consoleSpy.mock.calls[0][0]
      expect(logCall).toContain('⚡ PERF: Model loaded')
    })
  })

  describe('Error Handling', () => {
    it('should handle logging errors gracefully', () => {
      const customLogger = createLogger()
      
      // This should not throw
      expect(() => {
        customLogger.error('test', 'Error message', { 
          circular: {} as any
        })
      }).not.toThrow()
    })
  })
})
