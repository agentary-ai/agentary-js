// IndexedDB + Cache Storage helpers
import { createLogger } from './logger';
const log = createLogger('storage');

export type CacheEntryMeta = {
  key: string;
  size: number;
  lastAccess: number;
  sri?: string;
};

const DB_NAME = 'agentary-cache-v1';
const META_STORE = 'meta';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putMeta(meta: CacheEntryMeta): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(meta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  log.trace('meta put', { key: meta.key, size: meta.size });
}

export async function getMeta(key: string): Promise<CacheEntryMeta | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const req = tx.objectStore(META_STORE).get(key);
    req.onsuccess = () => resolve(req.result as any);
    req.onerror = () => reject(req.error);
  });
}

export async function listMetas(): Promise<CacheEntryMeta[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const req = tx.objectStore(META_STORE).getAll();
    req.onsuccess = () => resolve((req.result as any[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMeta(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  log.debug('meta delete', { key });
}

export async function ensureCache(): Promise<Cache> {
  return await caches.open('agentary-model-cache');
}

export async function putCache(key: string, response: Response, sri?: string): Promise<void> {
  const cache = await ensureCache();
  await cache.put(key, response.clone());
  const size = Number(response.headers.get('content-length') ?? '0');
  const meta: CacheEntryMeta = sri !== undefined
    ? { key, size, lastAccess: Date.now(), sri }
    : { key, size, lastAccess: Date.now() };
  await putMeta(meta);
  log.debug('cache put', { key, size });
}

export async function getCache(key: string): Promise<Response | undefined> {
  const cache = await ensureCache();
  const res = await cache.match(key);
  if (res) await putMeta({ ...(await getMeta(key)), key, size: Number(res.headers.get('content-length') ?? '0'), lastAccess: Date.now() } as CacheEntryMeta);
  log.trace(res ? 'cache hit' : 'cache miss', { key });
  return res ?? undefined;
}

export async function evictLruIfNeeded(maxBytes: number): Promise<void> {
  const metas = await listMetas();
  let total = metas.reduce((s, m) => s + (m.size || 0), 0);
  if (total <= maxBytes) return;
  metas.sort((a, b) => a.lastAccess - b.lastAccess);
  const cache = await ensureCache();
  for (const m of metas) {
    await cache.delete(m.key);
    await deleteMeta(m.key);
    total -= m.size;
    log.info('evicted', { key: m.key, freed: m.size, totalAfter: total });
    if (total <= maxBytes) break;
  }
}


