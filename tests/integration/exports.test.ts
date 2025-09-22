import { describe, it, expect } from 'vitest'

describe('Library Exports', () => {
  it('should export core functions', async () => {
    // Test that we can import the main exports
    const { createSession, createAgentSession } = await import('../../src/index')
    
    expect(createSession).toBeTypeOf('function')
    expect(createAgentSession).toBeTypeOf('function')
  })

  it('should export types', async () => {
    // Test that types can be imported
    const sessionTypes = await import('../../src/types/session')
    const workerTypes = await import('../../src/types/worker')
    const agentTypes = await import('../../src/types/agent-session')
    
    expect(sessionTypes).toBeDefined()
    expect(workerTypes).toBeDefined()
    expect(agentTypes).toBeDefined()
  })

  it('should export logger utilities', async () => {
    const { logger, createLogger, LogLevel } = await import('../../src/utils/logger')
    
    expect(logger).toBeDefined()
    expect(createLogger).toBeTypeOf('function')
    expect(LogLevel).toBeDefined()
    expect(LogLevel.DEBUG).toBe(0)
    expect(LogLevel.INFO).toBe(1)
    expect(LogLevel.WARN).toBe(2)
    expect(LogLevel.ERROR).toBe(3)
    expect(LogLevel.SILENT).toBe(4)
  })

  it('should export logger config utilities', async () => {
    const { LogConfigs, enableDebuggingMode, disableDebuggingMode } = await import('../../src/utils/logger-config')
    
    expect(LogConfigs).toBeDefined()
    expect(enableDebuggingMode).toBeTypeOf('function')
    expect(disableDebuggingMode).toBeTypeOf('function')
  })
})
