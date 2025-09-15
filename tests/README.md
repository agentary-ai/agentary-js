# Agentary JS Tests

This directory contains the test suite for Agentary JS, covering core functionality, types, and integrations.

## Test Structure

```
tests/
├── basic.test.ts              # Basic functionality tests
├── types/
│   └── api-types.test.ts      # TypeScript type validation tests
├── integration/
│   └── exports.test.ts        # Library export tests
├── core/
│   └── session.test.ts        # Core session tests (WIP)
├── workers/
│   └── worker-manager.test.ts # Worker management tests (WIP) 
├── processing/
│   └── tools/
│       └── parser.test.ts     # Tool parsing tests (WIP)
├── workflow/
│   └── executor.test.ts       # Workflow execution tests (WIP)
├── utils/
│   └── logger.test.ts         # Logger tests (WIP)
└── setup/
    └── vitest.setup.ts        # Test environment setup
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Run specific test files
npm test tests/basic.test.ts
npm test tests/types/api-types.test.ts
```

## Current Status

### ✅ Working Tests (16 tests passing)

- **Basic Tests**: Core TypeScript and async functionality
- **Type Tests**: API type definitions and validation  
- **Export Tests**: Library module exports and imports

### 🚧 Work in Progress

- **Session Tests**: Core session management (mocking issues)
- **Worker Tests**: Worker communication and lifecycle
- **Tool Parser Tests**: Tool call parsing logic
- **Workflow Tests**: Agent workflow execution
- **Logger Tests**: Logging system functionality

## Test Configuration

The test suite uses:

- **Vitest**: Fast, ESM-native test runner
- **Happy-DOM**: Lightweight DOM environment for browser APIs
- **Mocking**: Web Worker and console APIs mocked for testing

### Coverage Thresholds

- Functions: 60%
- Lines: 60% 
- Branches: 60%
- Statements: 60%

## Testing Philosophy

1. **Start Simple**: Basic functionality first
2. **Progressive Complexity**: Build up to integration tests
3. **Mock External Dependencies**: Focus on unit logic
4. **Real Integration Tests**: Validate actual exports and types

## Contributing Tests

When adding tests:

1. Follow the existing structure
2. Use descriptive test names
3. Group related tests in `describe` blocks
4. Mock external dependencies appropriately
5. Test both success and error cases

## Future Work

- Complete session management tests
- Add worker communication tests  
- Implement tool parsing validation
- Create end-to-end workflow tests
- Add performance benchmarks
