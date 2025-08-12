import { type CreateSessionArgs, type GenerateArgs, type Session, type TokenStreamChunk } from '../types/api';
import { probeCapabilities, planExecution } from './capabilities';
import { loadManifest, streamAndCache, ensureCacheBudget, type Manifest, loadHfManifest } from './manifest';
import { recordMetric } from './metrics';
import { createLogger } from './logger';
import { SimpleWhitespaceTokenizer } from '../tokenizer';
import { Sampler, type SamplerOptions } from '../sampler';


export async function createSession(args: CreateSessionArgs): Promise<Session> {
  const log = createLogger('session');

  log.info('createSession', { args });

  const t0 = performance.now();
  const report = await probeCapabilities();
  recordMetric('capability_probe_ms', performance.now() - t0);

  const plan = planExecution(args.engine ?? 'auto', args.ctx, report);
  log.info('plan', { plan });

  // Resolve manifest from:
  // - hf:owner/repo[@rev][#subfolder]
  // - absolute URL to a manifest.json
  // - fallback to demo hardcoded manifest
  let manifest: Manifest;
  try {
    if (args.model.startsWith('hf:')) {
      manifest = await loadHfManifest(args.model, args.hfToken);
    } else if (/^https?:\/\//i.test(args.model)) {
      manifest = await loadManifest(args.model, args.hfToken ? { headers: { Authorization: `Bearer ${args.hfToken}` } } : undefined);
    } else {
      // Legacy/demo path
      manifest = {
        modelId: 'gguf:q4_0/1.5B',
        tokenizerUrl: 'https://cdn.example.com/models/q4_0/1.5B/tokenizer.json',
        shards: [
          { url: 'https://cdn.example.com/models/q4_0/1.5B/shard1.bin', bytes: 1024 * 1024 * 1024 },
          { url: 'https://cdn.example.com/models/q4_0/1.5B/shard2.bin', bytes: 1024 * 1024 * 1024 },
        ],
        adapters: [],
        params: { vocabSize: 32000, numLayers: 2, hiddenSize: 512 },
        version: '0.0.1-demo',
      };
    }
  } catch (e) {
    log.warn('manifest resolution failed, using demo manifest', { error: (e as any)?.message ?? String(e) });
    manifest = {
      modelId: 'gguf:q4_0/1.5B',
      tokenizerUrl: 'https://cdn.example.com/models/q4_0/1.5B/tokenizer.json',
      shards: [
        { url: 'https://cdn.example.com/models/q4_0/1.5B/shard1.bin', bytes: 1024 * 1024 * 1024 },
        { url: 'https://cdn.example.com/models/q4_0/1.5B/shard2.bin', bytes: 1024 * 1024 * 1024 },
      ],
      adapters: [],
      params: { vocabSize: 32000, numLayers: 2, hiddenSize: 512 },
      version: '0.0.1-demo',
    };
  }

  // Cache budget ~ 2x model size or device budget
  const budget = Math.min(2 * manifest.shards.reduce((s, x) => s + x.bytes, 0), report.maxMemoryBudgetMB * 1024 * 1024);
  await ensureCacheBudget(budget);
  log.debug('budget ensured', { budget });

  // Progressive shard loading
  const modelBuffers: ArrayBuffer[] = [];
  // for (const shard of manifest.shards) {
  //   const buf = await streamAndCache(
  //     shard.url,
  //     shard.sri,
  //     args.hfToken ? { headers: { Authorization: `Bearer ${args.hfToken}` } } : undefined,
  //   );
  //   modelBuffers.push(buf);
  //   log.debug('shard loaded', { url: shard.url, bytes: shard.bytes });
  //   // Optional: early warm-up once N layers available — skipped in MVP
  // }

  // Tokenizer — placeholder
  const tokenizer = new SimpleWhitespaceTokenizer();

  const worker = new Worker(new URL('./worker/inferenceWorker.js', import.meta.url), { type: 'module' });
  const ready = new Promise<void>((resolve, reject) => {
    worker.onmessage = (ev) => {
      const msg = ev.data as any;
      if (msg?.type === 'ready') resolve();
    };
    worker.onerror = (e) => reject(e);
  });
  worker.postMessage({ type: 'init', payload: { modelBuffers, plan } });
  await ready;
  log.info('worker ready');

  let disposed = false;

  async function* generate(gen: GenerateArgs): AsyncIterable<TokenStreamChunk> {
    if (disposed) throw new Error('Session disposed');

    const samplerOpts: SamplerOptions = {};
    if (gen.temperature !== undefined) samplerOpts.temperature = gen.temperature;
    if (gen.top_p !== undefined) samplerOpts.top_p = gen.top_p;
    if (gen.top_k !== undefined) samplerOpts.top_k = gen.top_k;
    if (gen.repetition_penalty !== undefined) samplerOpts.repetition_penalty = gen.repetition_penalty;
    if (gen.seed !== undefined) samplerOpts.seed = gen.seed;
    if (gen.deterministic !== undefined) samplerOpts.deterministic = gen.deterministic;
    const sampler = new Sampler(samplerOpts);

    const inputText = `${gen.system ? gen.system + '\n' : ''}${gen.prompt ?? ''}`;
    const inputIds = tokenizer.encode(inputText);

    const queue: TokenStreamChunk[] = [];
    let done = false;
    let first = true;
    const ttfbStart = performance.now();

    const onmessage = (ev: MessageEvent<any>) => {
      const msg = ev.data;
      if (msg?.type === 'token') {
        const chunk: TokenStreamChunk = {
          tokenId: msg.tokenId,
          token: tokenizer.decode([msg.tokenId]),
          isFirst: first,
          isLast: false,
          ttfbMs: first ? (performance.now() - ttfbStart) : undefined,
        } as TokenStreamChunk;
        if (first && chunk.ttfbMs != null) recordMetric('ttfb_ms', chunk.ttfbMs);
        first = false;
        queue.push(chunk);
      } else if (msg?.type === 'done') {
        done = true;
        log.debug('generation done');
      }
    };

    const onerror = (e: MessageEvent<any>) => {
      done = true;
    };

    worker.addEventListener('message', onmessage);
    worker.addEventListener('error', onerror as any);
    worker.postMessage({ type: 'generate', payload: { inputIds, opts: {} } });
    log.debug('generation started', { inputTokens: inputIds.length });

    try {
      while (!done || queue.length) {
        if (queue.length) {
          yield queue.shift()!;
        } else {
          await new Promise((r) => setTimeout(r, 1));
        }
      }
      yield { token: '', tokenId: -1, isFirst: false, isLast: true };
    } finally {
      worker.removeEventListener('message', onmessage);
      worker.removeEventListener('error', onerror as any);
    }
  }

  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    worker.postMessage({ type: 'dispose' });
    worker.terminate();
  }

  const session: Session = { generate, dispose };
  return session;
}


