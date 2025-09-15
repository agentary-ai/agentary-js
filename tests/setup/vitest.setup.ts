import { vi } from 'vitest'

// Mock Web Worker for testing
global.Worker = vi.fn().mockImplementation((scriptURL: string | URL) => {
  const worker = {
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    close: vi.fn()
  }
  
  // Store reference for test manipulation
  ;(worker as any).__scriptURL = scriptURL
  
  return worker
})

// Mock performance.now for consistent timing in tests
Object.defineProperty(global, 'performance', {
  value: {
    now: vi.fn(() => Date.now())
  }
})

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  // log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}

// Mock setTimeout/setInterval for test control
vi.mock('timers', () => ({
  setTimeout: vi.fn((fn) => fn()),
  setInterval: vi.fn(),
  clearTimeout: vi.fn(),
  clearInterval: vi.fn()
}))
