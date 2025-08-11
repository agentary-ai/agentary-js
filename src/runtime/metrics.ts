type MetricName =
  | 'capability_probe_ms'
  | 'model_manifest_fetch_ms'
  | 'model_total_bytes'
  | 'model_stream_fetch_ms'
  | 'warmup_ms'
  | 'ttfb_ms'
  | 'tok_per_s'
  | 'oom_event'
  | 'engine_used';

type Metric = { name: MetricName; value: number | string; at: number };

const metrics: Metric[] = [];
const listeners: Array<(m: Metric) => void> = [];

export function recordMetric(name: MetricName, value: number | string): void {
  const m: Metric = { name, value, at: performance.now() };
  metrics.push(m);
  for (const fn of listeners) fn(m);
}

export function onMetric(fn: (m: Metric) => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function getMetrics(): Metric[] {
  return metrics.slice();
}


