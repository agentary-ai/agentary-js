import { mkdir, copyFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

async function fileExists(p) {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const srcDir = path.resolve(projectRoot, 'node_modules', 'onnxruntime-web', 'dist');
  const destDir = path.resolve(projectRoot, 'dist', 'runtime');

  const filesToCopy = [
    'ort.bundle.min.mjs',
    'ort-wasm-simd-threaded.jsep.mjs',
    'ort-wasm-simd-threaded.jsep.wasm',
  ];

  await mkdir(destDir, { recursive: true });

  for (const filename of filesToCopy) {
    const from = path.join(srcDir, filename);
    const to = path.join(destDir, filename);
    const exists = await fileExists(from);
    if (!exists) {
      console.warn(`[copy-ort-assets] Skipping missing file: ${from}`);
      continue;
    }
    await copyFile(from, to);
    console.log(`[copy-ort-assets] Copied ${filename} -> ${path.relative(projectRoot, to)}`);
  }
}

main().catch((err) => {
  console.error('[copy-ort-assets] Failed:', err);
  process.exitCode = 1;
});


