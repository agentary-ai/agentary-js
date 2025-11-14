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