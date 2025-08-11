export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

export type LogRecord = {
  level: Exclude<LogLevel, 'silent'>;
  time: number;
  scope: string;
  message: string;
  data?: Record<string, unknown>;
};

let currentLevel: LogLevel = 'info';
let prettyOutput = true;
let customSink: ((r: LogRecord) => void) | null = null;

const levelOrder: Record<Exclude<LogLevel, 'silent'>, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function setLogPretty(pretty: boolean): void {
  prettyOutput = pretty;
}

export function setLogSink(sink: ((r: LogRecord) => void) | null): void {
  customSink = sink;
}

function shouldLog(level: Exclude<LogLevel, 'silent'>): boolean {
  if (currentLevel === 'silent') return false;
  const threshold = currentLevel === 'trace' ? 10 : currentLevel === 'debug' ? 20 : currentLevel === 'info' ? 30 : currentLevel === 'warn' ? 40 : 50;
  return levelOrder[level] >= threshold;
}

function consoleSink(rec: LogRecord): void {
  const ts = new Date(rec.time).toISOString();
  const lvl = rec.level.toUpperCase().padEnd(5);
  const base = `${ts} [${lvl}] ${rec.scope}: ${rec.message}`;
  const safeData = rec.data ? redactData(rec.data) : undefined;
  if (!prettyOutput) {
    // Structured JSON
    const out = { ...rec, data: safeData };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(out));
    return;
  }
  if (safeData) {
    switch (rec.level) {
      case 'warn':
        // eslint-disable-next-line no-console
        console.warn(base, safeData);
        break;
      case 'error':
        // eslint-disable-next-line no-console
        console.error(base, safeData);
        break;
      default:
        // eslint-disable-next-line no-console
        console.log(base, safeData);
        break;
    }
  } else {
    switch (rec.level) {
      case 'warn':
        // eslint-disable-next-line no-console
        console.warn(base);
        break;
      case 'error':
        // eslint-disable-next-line no-console
        console.error(base);
        break;
      default:
        // eslint-disable-next-line no-console
        console.log(base);
        break;
    }
  }
}

export function createLogger(scope: string): {
  trace: (message: string, data?: Record<string, unknown>) => void;
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
} {
  function emit(level: Exclude<LogLevel, 'silent'>, message: string, data?: Record<string, unknown>): void {
    if (!shouldLog(level)) return;
    const rec: LogRecord = { level, time: Date.now(), scope, message, ...(data ? { data } : {}) };
    if (customSink) {
      try { customSink(rec); } catch {}
    } else {
      consoleSink(rec);
    }
  }
  return {
    trace: (message, data) => emit('trace', message, data),
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, data) => emit('error', message, data),
  };
}

// Simple redaction: drop known sensitive fields, shorten long strings/arrays
const SENSITIVE_KEYS = new Set(['prompt', 'system', 'tools', 'inputIds', 'modelBuffers', 'adapters']);

export function redactData(data: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  const entries = Object.entries(data);
  for (const [k, v] of entries) {
    if (SENSITIVE_KEYS.has(k)) continue;
    copy[k] = summarize(v);
  }
  return copy;
}

function summarize(v: unknown): unknown {
  if (v == null) return v as undefined;
  if (typeof v === 'string') return v.length > 200 ? v.slice(0, 200) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.length > 20 ? `[array ${v.length}]` : v.map(summarize);
  if (v instanceof ArrayBuffer) return `[arraybuffer ${v.byteLength}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const key of Object.keys(o)) {
      if (count++ > 20) { out['…'] = 'truncated'; break; }
      if (SENSITIVE_KEYS.has(key)) continue;
      out[key] = summarize(o[key]);
    }
    return out;
  }
  try { return String(v); } catch { return '[unserializable]'; }
}


