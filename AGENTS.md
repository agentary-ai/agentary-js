## Logging Guidelines

### Quick Reference

| Level | What to Log | Example | When to Use |
|-------|-------------|---------|-------------|
| **VERBOSE** | Full data dumps, every operation | `"Full message content: [...]"` | Deep debugging only - logs everything |
| **DEBUG** | Implementation details & summaries | `"Messages transformed (count: 5)"` | Development - execution flow |
| **INFO** | Key milestones | `"Worker initialized successfully"` | Production - important events |
| **WARN** | Concerning but non-fatal issues | `"Max iterations reached"` | Potential problems |
| **ERROR** | Failures that break execution | `"Worker initialization failed"` | Fatal errors |

### Level Guidelines

#### VERBOSE (0) - Use Sparingly
- Full message arrays and contents
- Every generated token
- Complete rendered prompts
- Full API payloads
- Complete memory snapshots
- **Warning**: Can significantly impact performance

```typescript
logger.worker.verbose('Messages transformed', { messages: tokenizerMessages }, requestId);
```

#### DEBUG (1) - Development Default
- Summaries and counts (not full data)
- Method entry/exit points
- State transitions
- Intent before async operations

```typescript
// ✅ Summary
logger.worker.debug('Messages transformed', { count: messages.length, roles: ['user', 'assistant'] });

// ❌ Full data (use verbose)
logger.worker.debug('All messages', { messages: fullArray });
```

#### INFO (2) - Production Default
- Initialization/disposal complete (with duration)
- Workflow started/completed
- Successful milestones only

```typescript
logger.deviceProvider.info('Worker initialized successfully', {
  model: this.config.model,
  duration: Date.now() - startTime
});
```

#### WARN (3) - Potential Issues
- Approaching/reaching limits
- Using fallback behavior
- Recoverable errors

```typescript
logger.agent.warn('Max iterations reached', { iterations, maxIterations });
```

#### ERROR (4) - Execution Failures
- Initialization failures
- Invalid configurations
- Network errors
- Always include error message and stack

```typescript
logger.worker.error('Worker initialization failed', {
  model: config.model,
  error: error.message,
  stack: error.stack
});
```

### Key Patterns

#### Before/After Async Operations
Log intent at DEBUG, result at INFO:

```typescript
logger.deviceProvider.debug('Initializing worker', { model });
await initialize();
logger.deviceProvider.info('Worker initialized successfully', { model, duration });
```

#### Loop Operations
Log summary, not each iteration:

```typescript
// ✅ Good
logger.inferenceProviderManager.debug('Registering models', { count: models.length });
for (const model of models) await createProvider(model);
logger.inferenceProviderManager.info('Models registered successfully', { count: models.length });

// ❌ Bad - too noisy
for (const model of models) {
  logger.info('Creating provider', { model });
}
```

#### Public vs Private Methods
- **Public/exported**: INFO for success
- **Private/internal**: DEBUG only

#### Data Privacy
- **VERBOSE/DEBUG**: Can log detailed data
- **INFO/WARN/ERROR**: Never log API keys, tokens, passwords
- Always prefer logging summaries over full configs

### Setting Log Levels

```typescript
import { setLogLevel } from './utils/logger-config';

setLogLevel('verbose');  // Deep debugging
setLogLevel('debug');    // Development
setLogLevel('info');     // Production
```

### Decision Tree

When writing new code, ask:
1. **Will this log on every iteration?** → Use DEBUG or VERBOSE
2. **Is this a key milestone?** → Use INFO
3. **Did something fail?** → Use ERROR
4. **Might this cause issues later?** → Use WARN
5. **Do I need to see full data?** → Use VERBOSE
6. **Is this implementation detail?** → Use DEBUG


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

## Documentation Guidelines

**CRITICAL REQUIREMENT**: Documentation must be updated whenever features are added, APIs are changed, or functionality is modified.

### When to Update Documentation

Documentation updates are required for:

1. **New Features** → Add to relevant guide or create new guide
2. **API Changes** → Update API reference documentation
3. **Breaking Changes** → Update migration guide and mark deprecations
4. **Configuration Options** → Update configuration documentation
5. **Bug Fixes** (user-facing) → Add to changelog or troubleshooting
6. **Examples** → Update or add examples when behavior changes

### Documentation Structure

```
docs/
├── pages/
│   ├── getting-started/     # Installation, quick start, core concepts
│   ├── guides/              # Feature guides, workflows, integrations
│   ├── api-reference/       # API documentation for classes/methods
│   └── index.mdx            # Landing page
├── MODEL-SUPPORT.md          # Model compatibility and testing status
└── ...                       # Nextra configuration files
README.md                     # Project overview, quick start (root level)
examples/*/README.md          # Example-specific documentation
```

### Documentation Types

#### API Reference (`docs/pages/api-reference/`)

Update when:
- Adding new classes, methods, or functions
- Changing method signatures or parameters
- Modifying return types
- Deprecating APIs

```mdx
## MethodName

Description of what the method does.

### Parameters

- `param1` (type): Description
- `param2` (type, optional): Description. Default: `value`

### Returns

- `ReturnType`: Description of return value

### Example

\`\`\`typescript
const result = await instance.methodName(param1, param2);
\`\`\`

### Throws

- `ErrorType`: When this error occurs
```

#### Guides (`docs/pages/guides/`)

Update when:
- Adding new features that require explanation
- Changing workflows or best practices
- Adding integration support
- Updating usage patterns

Best practices:
- Start with a clear objective ("Learn how to...")
- Provide complete, working examples
- Explain the "why" not just the "how"
- Include common pitfalls and solutions
- Link to related API reference documentation

#### Getting Started (`docs/pages/getting-started/`)

Update when:
- Installation process changes
- Core concepts are added or modified
- Quick start examples need updates
- Prerequisites change

Keep it:
- Beginner-friendly
- Focused on essentials
- Working from first principles
- Up to date with latest stable version

#### Model Support (`docs/MODEL-SUPPORT.md`)

Update when:
- Adding support for new models
- Changing model compatibility
- Updating test results or benchmarks
- Documenting known issues with specific models

### README Guidelines

The root `README.md` should contain:

1. **Project Overview**: Brief description of what the library does
2. **Key Features**: Bullet points of main capabilities
3. **Quick Start**: Minimal working example
4. **Installation**: Basic installation instructions
5. **Documentation Link**: Link to full docs
6. **License & Contributing**: Links to relevant files

Update README when:
- Major features are added
- Installation process changes
- Project scope or purpose evolves
- Quick start example needs updates

**Keep it concise** - detailed documentation belongs in `docs/`

### Example README Files

For examples in `examples/` directory:

```markdown
# Example Name

Brief description of what this example demonstrates.

## Features Demonstrated

- Feature 1
- Feature 2

## Prerequisites

- Requirement 1
- Requirement 2

## Setup

\`\`\`bash
npm install
\`\`\`

## Running

\`\`\`bash
npm start
\`\`\`

## Key Concepts

Brief explanation of important concepts shown in this example.
```

### Documentation Quality Standards

#### Clear and Concise

```mdx
<!-- ✅ Good -->
Creates a new agent session with the specified configuration.

<!-- ❌ Too verbose -->
This method is used for the purpose of creating a brand new agent session
instance that will be configured according to the parameters you provide.
```

#### Complete Examples

```typescript
// ✅ Good - Complete and runnable
import { Agent } from 'agentary';

const agent = new Agent({
  model: 'Llama-3.2-1B-Instruct',
  maxIterations: 5
});

const session = agent.createSession();
const result = await session.execute('Hello!');
console.log(result.message);

// ❌ Bad - Incomplete
const agent = new Agent(...);
// ... configure agent
```

#### Accurate Type Information

```mdx
<!-- ✅ Good -->
- `config` (AgentConfig): Configuration object
  - `model` (string): Model identifier
  - `maxIterations` (number, optional): Max loops. Default: 10

<!-- ❌ Bad - Vague -->
- config: The configuration
```

### Documentation Checklist

Before submitting code:

1. ✅ API reference updated for new/changed methods
2. ✅ Relevant guides updated or created
3. ✅ Examples work with new changes
4. ✅ Code examples are tested and runnable
5. ✅ Links between documents are valid
6. ✅ README updated if user-facing changes
7. ✅ MODEL-SUPPORT.md updated if model changes

### Building & Testing Documentation

```bash
# Build documentation site
cd docs && npm run build

# Preview documentation locally
cd docs && npm run dev

# Verify all links work
cd docs && npm run build  # Will fail on broken links
```

### Best Practices

- Update documentation in the same PR as code changes
- Use present tense ("creates" not "will create")
- Include both simple and advanced examples
- Keep examples focused on one concept
- Test all code examples before committing
- Use consistent terminology throughout
- Link to related documentation sections
- Include troubleshooting for common issues

## Commit Message Guidelines

We follow **Conventional Commits** format for all commit messages.

### Commit Types

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Formatting changes (code style, whitespace, etc.)
- `refactor:` - Code refactoring without changing functionality
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks (dependencies, build config, etc.)

### Format

```
type: brief description

[optional body]
```

### Examples

```bash
feat: add cloud provider support
fix: resolve memory leak in worker disposal
docs: update API reference for session methods
style: format code with prettier
refactor: simplify workflow executor logic
test: add unit tests for memory manager
chore: update dependencies
```

### Best Practices

- Use present tense ("add feature" not "added feature")
- Keep the subject line under 72 characters
- Don't capitalize the first letter after the colon
- No period at the end of the subject line
- Provide additional context in the body when needed