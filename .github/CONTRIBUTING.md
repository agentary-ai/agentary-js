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
