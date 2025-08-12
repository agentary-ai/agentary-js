type EngineKind = 'auto' | 'webgpu' | 'wasm' | 'webnn';
interface CreateSessionArgs {
    model: string;
    adapters?: string[];
    ctx?: number;
    engine?: EngineKind;
    hfToken?: string;
}
interface GenerateArgs {
    prompt?: string;
    system?: string;
    tools?: unknown[];
    stop?: string[];
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repetition_penalty?: number;
    seed?: number;
    deterministic?: boolean;
    retrieval?: {
        queryFn?: (q: string, k: number) => Promise<string[]> | string[];
        k?: number;
    } | null;
}
interface TokenStreamChunk {
    token: string;
    tokenId: number;
    isFirst: boolean;
    isLast: boolean;
    ttfbMs?: number;
    tokensPerSecond?: number;
}
interface Session {
    generate(args: GenerateArgs): AsyncIterable<TokenStreamChunk>;
    dispose(): Promise<void>;
}

declare function createSession(args: CreateSessionArgs): Promise<Session>;

type FeatureFlags = {
    enableSpeculativeDecoding: boolean;
    enableLocalRag: boolean;
    preferWebGPU: boolean;
};
declare function setFeatureFlags(flags: Partial<FeatureFlags>): void;
declare function getFeatureFlags(): FeatureFlags;

type MetricName = 'capability_probe_ms' | 'model_manifest_fetch_ms' | 'model_total_bytes' | 'model_stream_fetch_ms' | 'warmup_ms' | 'ttfb_ms' | 'tok_per_s' | 'oom_event' | 'engine_used';
type Metric = {
    name: MetricName;
    value: number | string;
    at: number;
};
declare function onMetric(fn: (m: Metric) => void): () => void;
declare function getMetrics(): Metric[];

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';
type LogRecord = {
    level: Exclude<LogLevel, 'silent'>;
    time: number;
    scope: string;
    message: string;
    data?: Record<string, unknown>;
};
declare function setLogLevel(level: LogLevel): void;
declare function setLogPretty(pretty: boolean): void;
declare function setLogSink(sink: ((r: LogRecord) => void) | null): void;

export { type CreateSessionArgs, type GenerateArgs, type Session, type TokenStreamChunk, createSession, getFeatureFlags, getMetrics, onMetric, setFeatureFlags, setLogLevel, setLogPretty, setLogSink };
