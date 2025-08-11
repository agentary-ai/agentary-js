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

async function fetchWithSRI(url: string, sri?: string): Promise<Response> {
  const log = createLogger('manifest');
  const t0 = performance.now();
  const init: RequestInit = { cache: 'force-cache' };
  if (sri !== undefined) init.integrity = sri;
  const res = await fetch(url, init);
  recordMetric('model_stream_fetch_ms', performance.now() - t0);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  log.debug('fetched shard', { url, bytes: Number(res.headers.get('content-length') ?? '0') });
  return res;
}

export async function loadManifest(url: string): Promise<Manifest> {
  const log = createLogger('manifest');
  const t0 = performance.now();
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
  const manifest = (await res.json()) as Manifest;
  recordMetric('model_manifest_fetch_ms', performance.now() - t0);
  recordMetric('model_total_bytes', manifest.shards.reduce((s, x) => s + x.bytes, 0));
  log.info('loaded manifest', { url, version: manifest.version, shards: manifest.shards.length, totalBytes: manifest.shards.reduce((s, x) => s + x.bytes, 0) });
  return manifest;
}

export async function streamAndCache(url: string, sri?: string): Promise<ArrayBuffer> {
  const log = createLogger('manifest');
  // Try cache first
  const cached = await getCache(url);
  if (cached) {
    log.debug('cache hit', { url });
    return await cached.arrayBuffer();
  }
  const res = await fetchWithSRI(url, sri);
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


