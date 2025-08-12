import { recordMetric } from './metrics';
import { getCache, putCache, evictLruIfNeeded } from './storage';
import { createLogger } from './logger';

export type Shard = { url: string; bytes: number; sri?: string };
export type Manifest = {
  modelId: string; // e.g. gguf:q4_0/1.5B
  tokenizerUrl: string;
  shards: Shard[];
  adapters?: { id: string; url: string; bytes: number; sri?: string }[];
  params: { vocabSize: number; numLayers: number; hiddenSize: number };
  version: string;
};

async function fetchWithSRI(url: string, sri?: string, init?: RequestInit): Promise<Response> {
  const log = createLogger('manifest');
  const t0 = performance.now();
  const reqInit: RequestInit = { cache: 'force-cache', ...(init ?? {}) };
  if (sri !== undefined) reqInit.integrity = sri;
  const res = await fetch(url, reqInit);
  recordMetric('model_stream_fetch_ms', performance.now() - t0);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  log.debug('fetched shard', { url, bytes: Number(res.headers.get('content-length') ?? '0') });
  return res;
}

export async function loadManifest(url: string, init?: RequestInit): Promise<Manifest> {
  const log = createLogger('manifest');
  const t0 = performance.now();
  const res = await fetch(url, { cache: 'no-cache', ...(init ?? {}) });
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
  const manifest = (await res.json()) as Manifest;
  recordMetric('model_manifest_fetch_ms', performance.now() - t0);
  recordMetric('model_total_bytes', manifest.shards.reduce((s, x) => s + x.bytes, 0));
  log.info('loaded manifest', { url, version: manifest.version, shards: manifest.shards.length, totalBytes: manifest.shards.reduce((s, x) => s + x.bytes, 0) });
  return manifest;
}

export async function streamAndCache(url: string, sri?: string, init?: RequestInit): Promise<ArrayBuffer> {
  const log = createLogger('manifest');
  // Try cache first
  const cached = await getCache(url);
  if (cached) {
    log.debug('cache hit', { url });
    return await cached.arrayBuffer();
  }
  const res = await fetchWithSRI(url, sri, init);
  const buf = await res.arrayBuffer();
  await putCache(url, new Response(buf, { headers: { 'content-length': String(buf.byteLength) } }), sri);
  log.debug('cache put', { url, bytes: buf.byteLength });
  return buf;
}

export async function ensureCacheBudget(maxBytes: number): Promise<void> {
  const log = createLogger('manifest');
  log.debug('ensure cache budget', { maxBytes });
  await evictLruIfNeeded(maxBytes);
}

// --- Hugging Face integration ---

/**
 * Resolve a Hugging Face repo spec into a Manifest by consulting the HF tree API
 * and constructing raw file URLs via the `resolve` endpoint.
 *
 * Supported model formats (best-effort):
 * - Single file .gguf
 * - Multiple shard .bin files (matches common sharded patterns)
 */
export async function loadHfManifest(repoSpec: string, token?: string): Promise<Manifest> {
  const log = createLogger('manifest');
  // Parse formats like:
  // - hf:owner/repo
  // - hf:owner/repo@rev
  // - hf:owner/repo#subfolder
  // - hf:owner/repo@rev#subfolder
  let spec = repoSpec;
  if (spec.startsWith('hf:')) spec = spec.slice(3);
  if (spec.startsWith('//')) spec = spec.slice(2);
  
  const splitHash = spec.split('#');
  const repoAndRev = (splitHash[0] ?? '').trim();
  const subfolder = (splitHash[1] ?? '').trim();
  const [ownerRepo, revision = 'main'] = repoAndRev.split('@');

  if (!ownerRepo || !ownerRepo.includes('/')) throw new Error('Invalid Hugging Face model spec. Expected hf:owner/repo[@rev][#subfolder]');

  const repoId = ownerRepo;
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const treeUrl = `https://huggingface.co/api/models/${encodeURIComponent(repoId)}/tree/${encodeURIComponent(revision)}?recursive=1&path=${encodeURIComponent(subfolder)}`;

  const t0 = performance.now();
  const treeRes = await fetch(treeUrl, { headers, cache: 'no-cache' });

  if (!treeRes.ok) throw new Error(`Failed to query Hugging Face tree: ${treeRes.status}`);
  const entries = (await treeRes.json()) as Array<{ path: string; size?: number; type: 'file' | 'directory' }>;
  
  recordMetric('model_manifest_fetch_ms', performance.now() - t0);

  // Identify candidate model files
  const files = entries.filter((e) => e.type === 'file').map((e) => ({ path: e.path, size: e.size ?? 0 }));
  const tokenizer = files.find((f) => /(?:^|\/)tokenizer\.json$/i.test(f.path));

  // Prefer .gguf single-file models; otherwise, fall back to .bin shards
  const ggufFiles = files.filter((f) => f.path.endsWith('.gguf'));
  let shards: Shard[] = [];
  if (ggufFiles.length > 0) {
    shards = ggufFiles.map((f) => ({
      url: `https://huggingface.co/${repoId}/resolve/${revision}/${f.path}`,
      bytes: f.size,
    }));
  } else {
    // Match common sharded bin patterns
    const shardBins = files.filter((f) => /\.(?:bin|safetensors)$/i.test(f.path));
    // Try to order deterministically: natural order by path
    shardBins.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
    shards = shardBins.map((f) => ({
      url: `https://huggingface.co/${repoId}/resolve/${revision}/${f.path}`,
      bytes: f.size,
    }));
  }

  if (shards.length === 0) throw new Error('No model files found in the specified Hugging Face repo');

  const totalBytes = shards.reduce((s, x) => s + x.bytes, 0);
  recordMetric('model_total_bytes', totalBytes);
  log.info('hf manifest resolved', { repoId, revision, subfolder, shards: shards.length, totalBytes });

  // Minimal params; real values would be read from metadata
  const manifest: Manifest = {
    modelId: `hf:${repoId}@${revision}${subfolder ? `#${subfolder}` : ''}`,
    tokenizerUrl: tokenizer ? `https://huggingface.co/${repoId}/resolve/${revision}/${tokenizer.path}` : '',
    shards,
    adapters: [],
    params: { vocabSize: 0, numLayers: 0, hiddenSize: 0 },
    version: 'hf-auto-0',
  };

  log.info('loadHfManifest', { manifest });

  return manifest;
}


