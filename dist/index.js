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
async function loadManifest(url, init) {
  const log3 = createLogger("manifest");
  const t0 = performance.now();
  const res = await fetch(url, { cache: "no-cache", ...init ?? {} });
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
  const manifest = await res.json();
  recordMetric("model_manifest_fetch_ms", performance.now() - t0);
  recordMetric("model_total_bytes", manifest.shards.reduce((s, x) => s + x.bytes, 0));
  log3.info("loaded manifest", { url, version: manifest.version, shards: manifest.shards.length, totalBytes: manifest.shards.reduce((s, x) => s + x.bytes, 0) });
  return manifest;
}
async function ensureCacheBudget(maxBytes) {
  const log3 = createLogger("manifest");
  log3.debug("ensure cache budget", { maxBytes });
  await evictLruIfNeeded(maxBytes);
}
async function loadHfManifest(repoSpec, token) {
  const log3 = createLogger("manifest");
  let spec = repoSpec;
  if (spec.startsWith("hf:")) spec = spec.slice(3);
  if (spec.startsWith("//")) spec = spec.slice(2);
  const splitHash = spec.split("#");
  const repoAndRev = (splitHash[0] ?? "").trim();
  const subfolder = (splitHash[1] ?? "").trim();
  const [ownerRepo, revision = "main"] = repoAndRev.split("@");
  if (!ownerRepo || !ownerRepo.includes("/")) throw new Error("Invalid Hugging Face model spec. Expected hf:owner/repo[@rev][#subfolder]");
  const repoId = ownerRepo;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const treeUrl = `https://huggingface.co/api/models/${encodeURIComponent(repoId)}/tree/${encodeURIComponent(revision)}?recursive=1&path=${encodeURIComponent(subfolder)}`;
  const t0 = performance.now();
  const treeRes = await fetch(treeUrl, { headers, cache: "no-cache" });
  if (!treeRes.ok) throw new Error(`Failed to query Hugging Face tree: ${treeRes.status}`);
  const entries = await treeRes.json();
  log3.info("treeRes parsed entries", { entriesCount: entries.length, sampleEntries: entries.slice(0, 3) });
  recordMetric("model_manifest_fetch_ms", performance.now() - t0);
  const files = entries.filter((e) => e.type === "file").map((e) => ({ path: e.path, size: e.size ?? 0 }));
  const tokenizer = files.find((f) => /(?:^|\/)tokenizer\.json$/i.test(f.path));
  const ggufFiles = files.filter((f) => f.path.endsWith(".gguf"));
  let shards = [];
  if (ggufFiles.length > 0) {
    shards = ggufFiles.map((f) => ({
      url: `https://huggingface.co/${repoId}/resolve/${revision}/${f.path}`,
      bytes: f.size
    }));
  } else {
    const shardBins = files.filter((f) => /\.(?:bin|safetensors)$/i.test(f.path));
    shardBins.sort((a, b) => a.path.localeCompare(b.path, void 0, { numeric: true }));
    shards = shardBins.map((f) => ({
      url: `https://huggingface.co/${repoId}/resolve/${revision}/${f.path}`,
      bytes: f.size
    }));
  }
  if (shards.length === 0) throw new Error("No model files found in the specified Hugging Face repo");
  const totalBytes = shards.reduce((s, x) => s + x.bytes, 0);
  recordMetric("model_total_bytes", totalBytes);
  log3.info("hf manifest resolved", { repoId, revision, subfolder, shards: shards.length, totalBytes });
  const manifest = {
    modelId: `hf:${repoId}@${revision}${subfolder ? `#${subfolder}` : ""}`,
    tokenizerUrl: tokenizer ? `https://huggingface.co/${repoId}/resolve/${revision}/${tokenizer.path}` : "",
    shards,
    adapters: [],
    params: { vocabSize: 0, numLayers: 0, hiddenSize: 0 },
    version: "hf-auto-0"
  };
  log3.info("loadHfManifest", { manifest });
  return manifest;
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
  let manifest;
  try {
    if (args.model.startsWith("hf:")) {
      manifest = await loadHfManifest(args.model, args.hfToken);
    } else if (/^https?:\/\//i.test(args.model)) {
      manifest = await loadManifest(args.model, args.hfToken ? { headers: { Authorization: `Bearer ${args.hfToken}` } } : void 0);
    } else {
      manifest = {
        modelId: "gguf:q4_0/1.5B",
        tokenizerUrl: "https://cdn.example.com/models/q4_0/1.5B/tokenizer.json",
        shards: [
          { url: "https://cdn.example.com/models/q4_0/1.5B/shard1.bin", bytes: 1024 * 1024 * 1024 },
          { url: "https://cdn.example.com/models/q4_0/1.5B/shard2.bin", bytes: 1024 * 1024 * 1024 }
        ],
        adapters: [],
        params: { vocabSize: 32e3, numLayers: 2, hiddenSize: 512 },
        version: "0.0.1-demo"
      };
    }
  } catch (e) {
    log3.warn("manifest resolution failed, using demo manifest", { error: e?.message ?? String(e) });
    manifest = {
      modelId: "gguf:q4_0/1.5B",
      tokenizerUrl: "https://cdn.example.com/models/q4_0/1.5B/tokenizer.json",
      shards: [
        { url: "https://cdn.example.com/models/q4_0/1.5B/shard1.bin", bytes: 1024 * 1024 * 1024 },
        { url: "https://cdn.example.com/models/q4_0/1.5B/shard2.bin", bytes: 1024 * 1024 * 1024 }
      ],
      adapters: [],
      params: { vocabSize: 32e3, numLayers: 2, hiddenSize: 512 },
      version: "0.0.1-demo"
    };
  }
  const budget = Math.min(2 * manifest.shards.reduce((s, x) => s + x.bytes, 0), report.maxMemoryBudgetMB * 1024 * 1024);
  await ensureCacheBudget(budget);
  log3.debug("budget ensured", { budget });
  const modelBuffers = [];
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