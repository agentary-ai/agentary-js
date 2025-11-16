#!/usr/bin/env node

/**
 * Postinstall script to check for available device runtimes
 * Provides helpful guidance if no runtimes are installed
 */

function tryRequire(moduleName) {
  try {
    require.resolve(moduleName);
    return true;
  } catch {
    return false;
  }
}

function main() {
  const hasTransformers = tryRequire('@huggingface/transformers');

  // If transformers is available, we're good
  if (hasTransformers) {
    return;
  }

  // No device runtimes detected - show helpful message
  console.log(`
╭─────────────────────────────────────────────────────────────╮
│                                                             │
│  ⚠️  No device runtimes detected                            │
│                                                             │
│  For on-device inference, install Transformers.js:         │
│                                                             │
│    npm install @huggingface/transformers                   │
│                                                             │
│  For cloud-only usage (OpenAI, Anthropic, etc.),           │
│  you're all set! ✅                                          │
│                                                             │
╭─────────────────────────────────────────────────────────────╯
`);
}

main();
