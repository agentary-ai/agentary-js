---
description: "Standards for commit messages using Conventional Commits format. Always apply when creating commits or reviewing commit history."
alwaysApply: true
---

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

