# Contributing to Agentary JS

Thank you for considering contributing to Agentary JS! This document provides guidelines and information for contributors.

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/agentary-js.git
   cd agentary-js
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Start development mode**
   ```bash
   npm run dev
   ```

## Development Workflow

### Making Changes

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and test them:
   ```bash
   npm run build
   npm run pack:test  # Test the package locally
   ```

3. Clean up test artifacts:
   ```bash
   npm run pack:clean
   ```

4. Commit your changes with a descriptive message:
   ```bash
   git commit -m "feat: add new feature description"
   ```

5. Push to your fork and create a pull request.

### Branch Naming Guidelines

Use descriptive branch names that follow this pattern: `type/short-description`

#### Branch Types

- `feature/` - New features or enhancements
  - Example: `feature/add-streaming-support`
  - Example: `feature/improve-error-handling`

- `fix/` or `bugfix/` - Bug fixes
  - Example: `fix/memory-leak-in-worker`
  - Example: `bugfix/null-pointer-exception`

- `hotfix/` - Urgent fixes for production issues
  - Example: `hotfix/critical-security-patch`
  - Example: `hotfix/api-timeout`

- `docs/` - Documentation updates
  - Example: `docs/update-api-reference`
  - Example: `docs/add-migration-guide`

- `refactor/` - Code refactoring (no functionality change)
  - Example: `refactor/simplify-session-manager`
  - Example: `refactor/extract-utility-functions`

- `test/` - Adding or updating tests
  - Example: `test/add-integration-tests`
  - Example: `test/improve-coverage`

- `chore/` - Maintenance tasks, dependency updates
  - Example: `chore/update-dependencies`
  - Example: `chore/configure-linter`

- `perf/` - Performance improvements
  - Example: `perf/optimize-token-counting`
  - Example: `perf/reduce-bundle-size`

#### Naming Best Practices

- **Use lowercase letters** and separate words with hyphens
  - ✅ `feature/add-memory-management`
  - ❌ `feature/AddMemoryManagement`

- **Be descriptive but concise** (ideally 2-4 words)
  - ✅ `fix/worker-initialization-error`
  - ❌ `fix/bug`
  - ❌ `fix/the-worker-fails-to-initialize-properly-when-options-are-null`

- **Reference issue numbers** when applicable
  - ✅ `fix/worker-crash-issue-123`
  - ✅ `feature/streaming-45`

- **Avoid special characters** (except hyphens and forward slashes)
  - ✅ `feature/add-new-parser`
  - ❌ `feature/add_new_parser`
  - ❌ `feature/add.new.parser`

- **Keep it focused** - one branch per feature/fix
  - ✅ `feature/add-retry-logic`
  - ❌ `feature/add-retry-logic-and-fix-timeout-and-update-docs`

#### Examples

```bash
# Feature development
git checkout -b feature/add-streaming-api

# Bug fix
git checkout -b fix/memory-leak-in-session

# Documentation
git checkout -b docs/update-quick-start-guide

# Hotfix for production
git checkout -b hotfix/security-vulnerability-cve-2024-1234

# Refactoring
git checkout -b refactor/simplify-workflow-executor

# Performance improvement
git checkout -b perf/optimize-embeddings-cache
```

### Commit Message Guidelines

We follow conventional commits:
- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation changes
- `style:` formatting changes
- `refactor:` code refactoring
- `test:` adding or updating tests
- `chore:` maintenance tasks

## Testing

Currently, the project uses a basic test setup. When adding features:

1. Ensure your code builds without errors
2. Test the package installation locally
3. Verify examples still work with your changes

## Release Process

### For Maintainers

1. **Create a release using GitHub Actions:**
   - Go to Actions → Release workflow
   - Click "Run workflow"
   - Select version bump type (patch/minor/major)
   - This creates a PR with version bump

2. **Review and merge the release PR**

3. **Create a GitHub release:**
   - Go to Releases → "Create a new release"
   - Tag: `v{VERSION}` (e.g., `v0.1.1`)
   - Title: `Release v{VERSION}`
   - Describe the changes
   - Click "Publish release"

4. **Automatic NPM publishing:**
   - The publish workflow triggers automatically
   - Package is published to NPM with provenance

### Manual Release (fallback)

If automated release fails:

```bash
# Bump version
npm version patch  # or minor/major

# Build and publish
npm run build
npm publish
```

## NPM Token Setup

For maintainers setting up the repository:

1. **Generate NPM token:**
   - Go to npmjs.com → Access Tokens
   - Create "Automation" token
   - Copy the token

2. **Add to GitHub Secrets:**
   - Repository Settings → Secrets and variables → Actions
   - Add secret: `NPM_TOKEN` = your npm token

## CI/CD Workflows

The repository includes three workflows:

### 1. CI (`ci.yml`)
- Runs on every push/PR to main
- Tests multiple Node.js versions
- Builds and validates package

### 2. Release (`release.yml`)
- Manual workflow for version bumping
- Creates PR with version changes
- Triggered via GitHub Actions UI

### 3. Publish (`publish.yml`)
- Triggers on GitHub release creation
- Automatically publishes to NPM
- Includes provenance for security

## Project Structure

```
src/
├── index.ts                  # Main exports
├── core/                     # Core functionality
├── workers/                  # Web Worker management
├── workflow/                 # Agent workflow engine
├── processing/               # Content/tool processing
├── engine/                   # Runtime engine
├── types/                    # TypeScript definitions
└── utils/                    # Utilities

.github/
├── workflows/                # CI/CD workflows
└── CONTRIBUTING.md           # This file

examples/
└── demo.html                 # Usage examples
```

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Check existing issues before creating new ones

Thank you for contributing! 🚀
