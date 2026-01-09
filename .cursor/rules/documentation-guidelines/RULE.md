---
description: "Standards for updating documentation, API references, guides, and examples. Always apply documentation requirements when adding features or changing APIs."
alwaysApply: true
---

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

