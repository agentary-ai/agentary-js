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
 * - Separate repos for tokenizer and quantized models (e.g., Llama 3.2)
 */
export async function loadHfManifest(repoSpec: string, token?: string): Promise<Manifest> {
  const log = createLogger('manifest');
  // Parse formats like:
  // - hf:owner/repo
  // - hf:owner/repo@rev
  // - hf:owner/repo#subfolder
  // - hf:owner/repo@rev#subfolder
  // - hf:main-repo,quantized-repo (for separate tokenizer and model repos)
  let spec = repoSpec;
  if (spec.startsWith('hf:')) spec = spec.slice(3);
  if (spec.startsWith('//')) spec = spec.slice(2);
  
  // Check if this is a comma-separated spec for separate repos
  const commaSplit = spec.split(',');
  const isMultiRepo = commaSplit.length === 2;
  
  let mainRepoSpec: string;
  let modelRepoSpec: string;
  
  if (isMultiRepo) {
    mainRepoSpec = commaSplit[0]!.trim();
    modelRepoSpec = commaSplit[1]!.trim();
  } else {
    mainRepoSpec = spec;
    modelRepoSpec = spec;
  }

  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  
  // Parse main repo (for tokenizer)
  const mainSplitHash = mainRepoSpec.split('#');
  const mainRepoAndRev = (mainSplitHash[0] ?? '').trim();
  const mainSubfolder = (mainSplitHash[1] ?? '').trim();
  const [mainOwnerRepo, mainRevision = 'main'] = mainRepoAndRev.split('@');

  if (!mainOwnerRepo || !mainOwnerRepo.includes('/')) {
    throw new Error('Invalid Hugging Face model spec. Expected hf:owner/repo[@rev][#subfolder] or hf:main-repo,quantized-repo');
  }

  // Parse model repo (for model files)
  const modelSplitHash = modelRepoSpec.split('#');
  const modelRepoAndRev = (modelSplitHash[0] ?? '').trim();
  const modelSubfolder = (modelSplitHash[1] ?? '').trim();
  const [modelOwnerRepo, modelRevision = 'main'] = modelRepoAndRev.split('@');

  if (!modelOwnerRepo || !modelOwnerRepo.includes('/')) {
    throw new Error('Invalid Hugging Face model spec. Expected hf:owner/repo[@rev][#subfolder] or hf:main-repo,quantized-repo');
  }

  const t0 = performance.now();
  
  // Fetch tokenizer from main repo
  const mainTreeUrl = `https://huggingface.co/api/models/${encodeURIComponent(mainOwnerRepo)}/tree/${encodeURIComponent(mainRevision)}?recursive=1&path=${encodeURIComponent(mainSubfolder)}`;
  const mainTreeRes = await fetch(mainTreeUrl, { headers, cache: 'no-cache' });
  
  if (!mainTreeRes.ok) throw new Error(`Failed to query main Hugging Face repo tree: ${mainTreeRes.status}`);
  const mainEntries = (await mainTreeRes.json()) as Array<{ path: string; size?: number; type: 'file' | 'directory' }>;
  
  // Fetch model files from model repo (could be same as main repo)
  let modelEntries: Array<{ path: string; size?: number; type: 'file' | 'directory' }>;
  if (isMultiRepo) {
    const modelTreeUrl = `https://huggingface.co/api/models/${encodeURIComponent(modelOwnerRepo)}/tree/${encodeURIComponent(modelRevision)}?recursive=1&path=${encodeURIComponent(modelSubfolder)}`;
    const modelTreeRes = await fetch(modelTreeUrl, { headers, cache: 'no-cache' });
    
    if (!modelTreeRes.ok) throw new Error(`Failed to query model Hugging Face repo tree: ${modelTreeRes.status}`);
    modelEntries = (await modelTreeRes.json()) as Array<{ path: string; size?: number; type: 'file' | 'directory' }>;
  } else {
    modelEntries = mainEntries;
  }
  
  recordMetric('model_manifest_fetch_ms', performance.now() - t0);

  // Find tokenizer in main repo
  const mainFiles = mainEntries.filter((e) => e.type === 'file').map((e) => ({ path: e.path, size: e.size ?? 0 }));
  const tokenizer = mainFiles.find((f) => /(?:^|\/)tokenizer\.json$/i.test(f.path));

  // Find model files in model repo
  const modelFiles = modelEntries.filter((e) => e.type === 'file').map((e) => ({ path: e.path, size: e.size ?? 0 }));

  // Prefer .gguf single-file models; otherwise, fall back to .bin shards
  const ggufFiles = modelFiles.filter((f) => f.path.endsWith('.gguf'));
  let shards: Shard[] = [];
  if (ggufFiles.length > 0) {
    shards = ggufFiles.map((f) => ({
      url: `https://huggingface.co/${modelOwnerRepo}/resolve/${modelRevision}/${f.path}`,
      bytes: f.size,
    }));
  } else {
    // Match common sharded bin patterns
    const shardBins = modelFiles.filter((f) => /\.(?:bin|safetensors)$/i.test(f.path));
    // Try to order deterministically: natural order by path
    shardBins.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
    shards = shardBins.map((f) => ({
      url: `https://huggingface.co/${modelOwnerRepo}/resolve/${modelRevision}/${f.path}`,
      bytes: f.size,
    }));
  }

  if (shards.length === 0) throw new Error('No model files found in the specified Hugging Face repo(s)');

  const totalBytes = shards.reduce((s, x) => s + x.bytes, 0);
  recordMetric('model_total_bytes', totalBytes);
  log.info('hf manifest resolved', { 
    mainRepo: mainOwnerRepo, 
    modelRepo: modelOwnerRepo, 
    revision: isMultiRepo ? `main:${mainRevision}, model:${modelRevision}` : mainRevision,
    subfolder: isMultiRepo ? `main:${mainSubfolder}, model:${modelSubfolder}` : mainSubfolder,
    shards: shards.length, 
    totalBytes 
  });

  // Minimal params; real values would be read from metadata
  const manifest: Manifest = {
    modelId: isMultiRepo ? `hf:${mainOwnerRepo},${modelOwnerRepo}@${mainRevision},${modelRevision}` : `hf:${mainOwnerRepo}@${mainRevision}${mainSubfolder ? `#${mainSubfolder}` : ''}`,
    tokenizerUrl: tokenizer ? `https://huggingface.co/${mainOwnerRepo}/resolve/${mainRevision}/${tokenizer.path}` : '',
    shards,
    adapters: [],
    params: { vocabSize: 0, numLayers: 0, hiddenSize: 0 },
    version: 'hf-auto-0',
  };

  log.info('loadHfManifest', { manifest });

  return manifest;
}


