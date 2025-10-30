import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'runtime/worker': 'src/workers/worker.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false,
  target: 'es2022',
  platform: 'browser',
  outDir: 'dist',
  external: ['openai', '@anthropic-ai/sdk'],
  noExternal: ['@huggingface/transformers'],
  async onSuccess() {
    // Copy ONNX Runtime runtime assets used by the worker into dist/runtime
    const { spawn } = await import('node:child_process');
    await new Promise((resolve, reject) => {
      const p = spawn('node', ['scripts/copy-ort-assets.mjs'], { stdio: 'inherit' });
      p.on('close', (code) => (code === 0 ? resolve(undefined) : reject(new Error(`copy-ort-assets exited with code ${code}`))));
      p.on('error', reject);
    });
  },
});


