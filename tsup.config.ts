import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'runtime/worker': 'src/runtime/worker.ts',
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
  external: [],
  noExternal: ['@huggingface/transformers'],
});


