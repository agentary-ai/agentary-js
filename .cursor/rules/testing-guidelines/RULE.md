---
description: "Standards for writing tests, test organization, and test quality. Always apply testing requirements when adding features or modifying code."
alwaysApply: true
---

## Testing Guidelines

**CRITICAL REQUIREMENT**: Tests must be written for all new features and updated for any code changes that affect existing functionality.

### Core Principles

1. **New Features** → Always include tests
2. **Code Changes** → Update affected tests
3. **Bug Fixes** → Add test to prevent regression
4. **Refactoring** → Ensure all tests still pass

### What to Test

#### Required Coverage

- **Public APIs**: All exported functions, classes, and methods
- **Error Handling**: Invalid inputs, edge cases, failure scenarios
- **State Transitions**: Initialization, execution, disposal
- **Integrations**: Provider interactions, external dependencies
- **Configuration**: Different config options and combinations

#### Test Organization

```typescript
// ✅ Good - Organized by feature/component
describe('MemoryManager', () => {
  describe('addMessage', () => {
    it('should add message to memory', () => {});
    it('should throw on invalid message', () => {});
  });

  describe('getMessages', () => {
    it('should return all messages', () => {});
    it('should filter by role when specified', () => {});
  });
});

// ❌ Bad - Disorganized
describe('Tests', () => {
  it('test 1', () => {});
  it('another test', () => {});
});
```

### Test Quality Standards

#### Descriptive Test Names

```typescript
// ✅ Clear intent
it('should initialize worker with specified model', () => {});
it('should throw error when API key is missing', () => {});

// ❌ Vague
it('works', () => {});
it('handles errors', () => {});
```

#### Isolated Tests

- Each test should be independent
- Use setup/teardown for shared state
- Mock external dependencies
- Clean up resources after tests

```typescript
describe('Worker', () => {
  let worker: Worker;

  beforeEach(() => {
    worker = new Worker(config);
  });

  afterEach(async () => {
    await worker.dispose();
  });

  it('should process request', async () => {
    // Test logic
  });
});
```

#### Comprehensive Assertions

```typescript
// ✅ Specific assertions
expect(result.status).toBe('success');
expect(result.data).toHaveLength(3);
expect(result.error).toBeUndefined();

// ❌ Weak assertions
expect(result).toBeDefined();
```

### Test-Driven Development Checklist

Before submitting code:

1. ✅ All new features have corresponding tests
2. ✅ Modified code has updated tests
3. ✅ All tests pass locally
4. ✅ Test coverage meets project standards
5. ✅ Edge cases and error scenarios covered
6. ✅ No skipped or disabled tests without justification

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- path/to/test.spec.ts

# Run with coverage
npm test -- --coverage
```

### When to Update Tests

- **Feature Addition**: Write new tests for the feature
- **Bug Fix**: Add regression test, then fix the bug
- **Refactoring**: Ensure existing tests still pass
- **API Changes**: Update tests to match new interface
- **Deprecation**: Mark tests accordingly, add new ones for replacement

### Best Practices

- Write tests alongside feature code, not after
- Test behavior, not implementation details
- Keep tests simple and readable
- Use meaningful test data
- Avoid test interdependence
- Mock external APIs and services
- Test both success and failure paths

