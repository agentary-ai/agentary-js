import { defineConfig } from 'vite';

export default defineConfig({
  // Root is the examples directory
  root: '.',

  // Configure worker to use ES module format
  worker: {
    format: 'es',
  },

  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: ['@huggingface/transformers'],
    esbuildOptions: {
      target: 'es2022',
    },
  },

  // Set build target to support modern features
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },

  // Enable SharedArrayBuffer for WebGPU
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
