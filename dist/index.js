var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/runtime/logger.ts
var logger_exports = {};
__export(logger_exports, {
  createLogger: () => createLogger,
  redactData: () => redactData,
  setLogLevel: () => setLogLevel,
  setLogPretty: () => setLogPretty,
  setLogSink: () => setLogSink
});
function setLogLevel(level) {
  currentLevel = level;
}
function setLogPretty(pretty) {
  prettyOutput = pretty;
}
function setLogSink(sink) {
  customSink = sink;
}
function shouldLog(level) {
  if (currentLevel === "silent") return false;
  const threshold = currentLevel === "trace" ? 10 : currentLevel === "debug" ? 20 : currentLevel === "info" ? 30 : currentLevel === "warn" ? 40 : 50;
  return levelOrder[level] >= threshold;
}
function consoleSink(rec) {
  const ts = new Date(rec.time).toISOString();
  const lvl = rec.level.toUpperCase().padEnd(5);
  const base = `${ts} [${lvl}] ${rec.scope}: ${rec.message}`;
  const safeData = rec.data ? redactData(rec.data) : void 0;
  if (!prettyOutput) {
    const out = { ...rec, data: safeData };
    console.log(JSON.stringify(out));
    return;
  }
  if (safeData) {
    switch (rec.level) {
      case "warn":
        console.warn(base, safeData);
        break;
      case "error":
        console.error(base, safeData);
        break;
      default:
        console.log(base, safeData);
        break;
    }
  } else {
    switch (rec.level) {
      case "warn":
        console.warn(base);
        break;
      case "error":
        console.error(base);
        break;
      default:
        console.log(base);
        break;
    }
  }
}
function createLogger(scope) {
  function emit(level, message, data) {
    if (!shouldLog(level)) return;
    const rec = { level, time: Date.now(), scope, message, ...data ? { data } : {} };
    if (customSink) {
      try {
        customSink(rec);
      } catch {
      }
    } else {
      consoleSink(rec);
    }
  }
  return {
    trace: (message, data) => emit("trace", message, data),
    debug: (message, data) => emit("debug", message, data),
    info: (message, data) => emit("info", message, data),
    warn: (message, data) => emit("warn", message, data),
    error: (message, data) => emit("error", message, data)
  };
}
function redactData(data) {
  const copy = {};
  const entries = Object.entries(data);
  for (const [k, v] of entries) {
    if (SENSITIVE_KEYS.has(k)) continue;
    copy[k] = summarize(v);
  }
  return copy;
}
function summarize(v) {
  if (v == null) return v;
  if (typeof v === "string") return v.length > 200 ? v.slice(0, 200) + "\u2026" : v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.length > 20 ? `[array ${v.length}]` : v.map(summarize);
  if (v instanceof ArrayBuffer) return `[arraybuffer ${v.byteLength}]`;
  if (typeof v === "object") {
    const o = v;
    const out = {};
    let count = 0;
    for (const key of Object.keys(o)) {
      if (count++ > 20) {
        out["\u2026"] = "truncated";
        break;
      }
      if (SENSITIVE_KEYS.has(key)) continue;
      out[key] = summarize(o[key]);
    }
    return out;
  }
  try {
    return String(v);
  } catch {
    return "[unserializable]";
  }
}
var currentLevel, prettyOutput, customSink, levelOrder, SENSITIVE_KEYS;
var init_logger = __esm({
  "src/runtime/logger.ts"() {
    currentLevel = "info";
    prettyOutput = true;
    customSink = null;
    levelOrder = {
      trace: 10,
      debug: 20,
      info: 30,
      warn: 40,
      error: 50
    };
    SENSITIVE_KEYS = /* @__PURE__ */ new Set(["prompt", "system", "tools", "inputIds", "modelBuffers", "adapters"]);
  }
});

// src/runtime/capabilities.ts
init_logger();
var log = createLogger("capabilities");
async function checkWasmFeatures() {
  log.debug("checkWasmFeatures");
  const simd = WebAssembly.validate?.(
    new Uint8Array([
      0,
      97,
      115,
      109,
      // magic
      1,
      0,
      0,
      0
      // version
    ])
  );
  const threads = typeof SharedArrayBuffer !== "undefined" && self.crossOriginIsolated === true;
  log.debug("checkWasmFeatures", { simd, threads });
  return { wasmSimd: !!simd, wasmThreads: !!threads };
}
async function getBattery() {
  try {
    const nav = navigator;
    if (nav?.getBattery) {
      const b = await nav.getBattery();
      return { charging: b.charging, level: b.level };
    }
  } catch {
  }
  return void 0;
}
async function probeCapabilities() {
  const t0 = performance.now();
  const log3 = (await Promise.resolve().then(() => (init_logger(), logger_exports))).createLogger("capabilities");
  const webgpu = typeof navigator.gpu !== "undefined";
  const webnn = typeof navigator.ml !== "undefined";
  const { wasmSimd, wasmThreads } = await checkWasmFeatures();
  const crossOriginIsolated = self.crossOriginIsolated === true;
  const dm = navigator.deviceMemory;
  const battery = await getBattery();
  const deviceMemoryGB = typeof dm === "number" ? dm : void 0;
  const maxMemoryBudgetMB = Math.floor((deviceMemoryGB ?? 4) * 1024 * 0.35);
  const base = {
    webgpu,
    webnn,
    wasmSimd,
    wasmThreads,
    crossOriginIsolated,
    maxMemoryBudgetMB
  };
  const report = {
    ...base,
    ...typeof deviceMemoryGB === "number" ? { deviceMemoryGB } : {},
    ...battery ? { battery } : {}
  };
  log3.info("probe completed", { durationMs: Math.round(performance.now() - t0), ...report });
  return report;
}
function planExecution(desiredEngine, desiredCtx, report) {
  const preferGpu = desiredEngine === "webgpu" || desiredEngine === "auto" && report.webgpu;
  const engine = preferGpu ? "webgpu" : report.wasmSimd ? "wasm" : report.webnn ? "webnn" : "wasm";
  let quant = engine === "webgpu" ? "q4" : "q4";
  const targetCtx = desiredCtx ?? 4096;
  const perTokenKVBytes = engine === "webgpu" ? 2 : 1.5;
  const kvBudgetMB = Math.max(64, Math.floor(report.maxMemoryBudgetMB * 0.5));
  const ctxFromBudget = Math.max(1024, Math.floor(kvBudgetMB / perTokenKVBytes * 1e3));
  const ctx = Math.min(targetCtx, ctxFromBudget);
  return { engine, quant, ctx };
}

// src/runtime/metrics.ts
var metrics = [];
var listeners = [];
function recordMetric(name, value) {
  const m = { name, value, at: performance.now() };
  metrics.push(m);
  for (const fn of listeners) fn(m);
}
function onMetric(fn) {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}
function getMetrics() {
  return metrics.slice();
}

// src/runtime/storage.ts
init_logger();
var log2 = createLogger("storage");
var DB_NAME = "agentary-cache-v1";
var META_STORE = "meta";
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function putMeta(meta) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put(meta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  log2.trace("meta put", { key: meta.key, size: meta.size });
}
async function getMeta(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function listMetas() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}
async function deleteMeta(key) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  log2.debug("meta delete", { key });
}
async function ensureCache() {
  return await caches.open("agentary-model-cache");
}
async function putCache(key, response, sri) {
  const cache = await ensureCache();
  await cache.put(key, response.clone());
  const size = Number(response.headers.get("content-length") ?? "0");
  const meta = sri !== void 0 ? { key, size, lastAccess: Date.now(), sri } : { key, size, lastAccess: Date.now() };
  await putMeta(meta);
  log2.debug("cache put", { key, size });
}
async function getCache(key) {
  const cache = await ensureCache();
  const res = await cache.match(key);
  if (res) await putMeta({ ...await getMeta(key), key, size: Number(res.headers.get("content-length") ?? "0"), lastAccess: Date.now() });
  log2.trace(res ? "cache hit" : "cache miss", { key });
  return res ?? void 0;
}
async function evictLruIfNeeded(maxBytes) {
  const metas = await listMetas();
  let total = metas.reduce((s, m) => s + (m.size || 0), 0);
  if (total <= maxBytes) return;
  metas.sort((a, b) => a.lastAccess - b.lastAccess);
  const cache = await ensureCache();
  for (const m of metas) {
    await cache.delete(m.key);
    await deleteMeta(m.key);
    total -= m.size;
    log2.info("evicted", { key: m.key, freed: m.size, totalAfter: total });
    if (total <= maxBytes) break;
  }
}

// src/runtime/manifest.ts
init_logger();
async function fetchWithSRI(url, sri) {
  const log3 = createLogger("manifest");
  const t0 = performance.now();
  const init = { cache: "force-cache" };
  if (sri !== void 0) init.integrity = sri;
  const res = await fetch(url, init);
  recordMetric("model_stream_fetch_ms", performance.now() - t0);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  log3.debug("fetched shard", { url, bytes: Number(res.headers.get("content-length") ?? "0") });
  return res;
}
async function streamAndCache(url, sri) {
  const log3 = createLogger("manifest");
  const cached = await getCache(url);
  if (cached) {
    log3.debug("cache hit", { url });
    return await cached.arrayBuffer();
  }
  const res = await fetchWithSRI(url, sri);
  const buf = await res.arrayBuffer();
  await putCache(url, new Response(buf, { headers: { "content-length": String(buf.byteLength) } }), sri);
  log3.debug("cache put", { url, bytes: buf.byteLength });
  return buf;
}
async function ensureCacheBudget(maxBytes) {
  const log3 = createLogger("manifest");
  log3.debug("ensure cache budget", { maxBytes });
  await evictLruIfNeeded(maxBytes);
}

// src/runtime/session.ts
init_logger();

// src/tokenizer/index.ts
var SimpleWhitespaceTokenizer = class {
  vocab = /* @__PURE__ */ new Map();
  rev = /* @__PURE__ */ new Map();
  constructor() {
    this.addToken("<BOS>");
    this.addToken("<EOS>");
  }
  addToken(tok) {
    if (this.vocab.has(tok)) return this.vocab.get(tok);
    const id = this.vocab.size;
    this.vocab.set(tok, id);
    this.rev.set(id, tok);
    return id;
  }
  encode(text) {
    const parts = text.split(/\s+/).filter(Boolean);
    const ids = [];
    for (const p of parts) ids.push(this.addToken(p));
    return ids;
  }
  decode(ids) {
    return ids.map((i) => this.rev.get(i) ?? "").join(" ");
  }
};

// src/sampler/index.ts
var Sampler = class {
  prngState;
  opts;
  seen = /* @__PURE__ */ new Map();
  constructor(opts = {}) {
    this.opts = {
      temperature: opts.temperature ?? 0.7,
      top_p: opts.top_p ?? 0.9,
      top_k: opts.top_k ?? 40,
      repetition_penalty: opts.repetition_penalty ?? 1.05,
      seed: opts.seed ?? 42,
      deterministic: opts.deterministic ?? false
    };
    this.prngState = this.opts.seed >>> 0;
  }
  rand() {
    let x = this.prngState;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.prngState = x >>> 0;
    return (this.prngState & 4294967295) / 4294967296;
  }
  updateSeen(tokenId) {
    this.seen.set(tokenId, (this.seen.get(tokenId) ?? 0) + 1);
  }
  nextToken(logits) {
    const adjusted = new Float32Array(logits.length);
    for (let i = 0; i < logits.length; i++) {
      const count = this.seen.get(i) ?? 0;
      adjusted[i] = logits[i] - Math.log(this.opts.repetition_penalty) * count;
    }
    const temp = Math.max(1e-5, this.opts.temperature);
    let maxLogit = -Infinity;
    for (let i = 0; i < adjusted.length; i++) if (adjusted[i] > maxLogit) maxLogit = adjusted[i];
    let sum = 0;
    const probs = new Float32Array(adjusted.length);
    for (let i = 0; i < adjusted.length; i++) {
      const v = Math.exp((adjusted[i] - maxLogit) / temp);
      probs[i] = v;
      sum += v;
    }
    for (let i = 0; i < probs.length; i++) probs[i] /= sum;
    const k = Math.min(this.opts.top_k, probs.length);
    const indices = Array.from(probs.keys());
    indices.sort((a, b) => probs[b] - probs[a]);
    const topIdx = indices.slice(0, k);
    let cumulative = 0;
    const nucleus = [];
    for (const i of topIdx) {
      nucleus.push(i);
      cumulative += probs[i];
      if (cumulative >= (this.opts.top_p ?? 1)) break;
    }
    if (this.opts.deterministic) {
      return nucleus[0] ?? topIdx[0] ?? 0;
    }
    let r = this.rand();
    let acc = 0;
    for (const i of nucleus) {
      acc += probs[i];
      if (r <= acc) return i;
    }
    return nucleus[nucleus.length - 1] ?? 0;
  }
};

// src/runtime/session.ts
async function createSession(args) {
  const log3 = createLogger("session");
  log3.info("createSession", { args });
  const t0 = performance.now();
  const report = await probeCapabilities();
  recordMetric("capability_probe_ms", performance.now() - t0);
  const plan = planExecution(args.engine ?? "auto", args.ctx, report);
  log3.info("plan", { plan });
  args.model.includes("http") ? args.model : `https://cdn.example.com/models/${args.model}/manifest.json`;
  const manifest = {
    shards: [
      { url: "https://cdn.example.com/models/q4_0/1.5B/shard1.bin", bytes: 1024 * 1024 * 1024 },
      { url: "https://cdn.example.com/models/q4_0/1.5B/shard2.bin", bytes: 1024 * 1024 * 1024 }
    ]};
  const budget = Math.min(2 * manifest.shards.reduce((s, x) => s + x.bytes, 0), report.maxMemoryBudgetMB * 1024 * 1024);
  await ensureCacheBudget(budget);
  log3.debug("budget ensured", { budget });
  const modelBuffers = [];
  for (const shard of manifest.shards) {
    const buf = await streamAndCache(shard.url, shard.sri);
    modelBuffers.push(buf);
    log3.debug("shard loaded", { url: shard.url, bytes: shard.bytes });
  }
  const tokenizer = new SimpleWhitespaceTokenizer();
  const worker = new Worker(new URL("./worker/inferenceWorker.js", import.meta.url), { type: "module" });
  const ready = new Promise((resolve, reject) => {
    worker.onmessage = (ev) => {
      const msg = ev.data;
      if (msg?.type === "ready") resolve();
    };
    worker.onerror = (e) => reject(e);
  });
  worker.postMessage({ type: "init", payload: { modelBuffers, plan } });
  await ready;
  log3.info("worker ready");
  let disposed = false;
  async function* generate(gen) {
    if (disposed) throw new Error("Session disposed");
    const samplerOpts = {};
    if (gen.temperature !== void 0) samplerOpts.temperature = gen.temperature;
    if (gen.top_p !== void 0) samplerOpts.top_p = gen.top_p;
    if (gen.top_k !== void 0) samplerOpts.top_k = gen.top_k;
    if (gen.repetition_penalty !== void 0) samplerOpts.repetition_penalty = gen.repetition_penalty;
    if (gen.seed !== void 0) samplerOpts.seed = gen.seed;
    if (gen.deterministic !== void 0) samplerOpts.deterministic = gen.deterministic;
    new Sampler(samplerOpts);
    const inputText = `${gen.system ? gen.system + "\n" : ""}${gen.prompt ?? ""}`;
    const inputIds = tokenizer.encode(inputText);
    const queue = [];
    let done = false;
    let first = true;
    const ttfbStart = performance.now();
    const onmessage = (ev) => {
      const msg = ev.data;
      if (msg?.type === "token") {
        const chunk = {
          tokenId: msg.tokenId,
          token: tokenizer.decode([msg.tokenId]),
          isFirst: first,
          isLast: false,
          ttfbMs: first ? performance.now() - ttfbStart : void 0
        };
        if (first && chunk.ttfbMs != null) recordMetric("ttfb_ms", chunk.ttfbMs);
        first = false;
        queue.push(chunk);
      } else if (msg?.type === "done") {
        done = true;
        log3.debug("generation done");
      }
    };
    const onerror = (e) => {
      done = true;
    };
    worker.addEventListener("message", onmessage);
    worker.addEventListener("error", onerror);
    worker.postMessage({ type: "generate", payload: { inputIds, opts: {} } });
    log3.debug("generation started", { inputTokens: inputIds.length });
    try {
      while (!done || queue.length) {
        if (queue.length) {
          yield queue.shift();
        } else {
          await new Promise((r) => setTimeout(r, 1));
        }
      }
      yield { token: "", tokenId: -1, isFirst: false, isLast: true };
    } finally {
      worker.removeEventListener("message", onmessage);
      worker.removeEventListener("error", onerror);
    }
  }
  async function dispose() {
    if (disposed) return;
    disposed = true;
    worker.postMessage({ type: "dispose" });
    worker.terminate();
  }
  const session = { generate, dispose };
  return session;
}

// src/runtime/flags.ts
var defaultFlags = {
  enableSpeculativeDecoding: false,
  enableLocalRag: false,
  preferWebGPU: true
};
var currentFlags = { ...defaultFlags };
function setFeatureFlags(flags) {
  currentFlags = { ...currentFlags, ...flags };
}
function getFeatureFlags() {
  return currentFlags;
}

// src/index.ts
init_logger();

export { createSession, getFeatureFlags, getMetrics, onMetric, setFeatureFlags, setLogLevel, setLogPretty, setLogSink };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map