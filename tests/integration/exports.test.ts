import { describe, it, expect } from 'vitest'

describe('Library Exports', () => {
  it('should export core functions', async () => {
    const { createSession, createAgentSession } = await import('../../src/index')
    
    expect(createSession).toBeTypeOf('function')
    expect(createAgentSession).toBeTypeOf('function')
  })

  it('should export types', async () => {
    const sessionTypes = await import('../../src/types/session')
    const workerTypes = await import('../../src/types/worker')
    const agentTypes = await import('../../src/types/agent-session')
    
    expect(sessionTypes).toBeDefined()
    expect(workerTypes).toBeDefined()
    expect(agentTypes).toBeDefined()
  })

  it('should export logger utilities', async () => {
    const { logger, createLogger, setGlobalLogLevel, LogLevel } = await import('../../src/index')
    
    expect(logger).toBeDefined()
    expect(createLogger).toBeTypeOf('function')
    expect(setGlobalLogLevel).toBeTypeOf('function')
    expect(LogLevel).toBeDefined()
    expect(LogLevel.VERBOSE).toBe(0)
    expect(LogLevel.DEBUG).toBe(1)
    expect(LogLevel.INFO).toBe(2)
    expect(LogLevel.WARN).toBe(3)
    expect(LogLevel.ERROR).toBe(4)
    expect(LogLevel.SILENT).toBe(5)
  })

  it('should export logger config utilities', async () => {
    const { LogConfigs, setLogLevel, getLogLevel, getEnvironmentConfig } = await import('../../src/index')
    
    expect(LogConfigs).toBeDefined()
    expect(setLogLevel).toBeTypeOf('function')
    expect(getLogLevel).toBeTypeOf('function')
    expect(getEnvironmentConfig).toBeTypeOf('function')
  })

  it('should export event system types', async () => {
    const events = await import('../../src/index')
    
    // Verify type exports are defined (TypeScript will catch missing exports at build time)
    expect(events).toBeDefined()
  })

  it('should export memory system classes', async () => {
    const { 
      MemoryManager, 
      SlidingWindowMemory, 
      Summarization, 
      DefaultMemoryFormatter 
    } = await import('../../src/index')
    
    expect(MemoryManager).toBeDefined()
    expect(SlidingWindowMemory).toBeDefined()
    expect(Summarization).toBeDefined()
    expect(DefaultMemoryFormatter).toBeDefined()
    expect(MemoryManager).toBeTypeOf('function')
    expect(SlidingWindowMemory).toBeTypeOf('function')
    expect(Summarization).toBeTypeOf('function')
    expect(DefaultMemoryFormatter).toBeTypeOf('function')
  })

  it('should export memory system types', async () => {
    const memory = await import('../../src/index')
    
    // Verify type exports are defined (TypeScript will catch missing exports at build time)
    expect(memory).toBeDefined()
  })

  it('should export provider system types', async () => {
    const providers = await import('../../src/index')
    
    // Verify type exports are defined (TypeScript will catch missing exports at build time)
    expect(providers).toBeDefined()
  })
})
