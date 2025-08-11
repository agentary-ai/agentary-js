export type SamplerOptions = {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
  seed?: number;
  deterministic?: boolean;
};

export class Sampler {
  private prngState: number;
  private opts: Required<SamplerOptions>;
  private seen: Map<number, number> = new Map();

  constructor(opts: SamplerOptions = {}) {
    this.opts = {
      temperature: opts.temperature ?? 0.7,
      top_p: opts.top_p ?? 0.9,
      top_k: opts.top_k ?? 40,
      repetition_penalty: opts.repetition_penalty ?? 1.05,
      seed: opts.seed ?? 42,
      deterministic: opts.deterministic ?? false,
    };
    this.prngState = this.opts.seed >>> 0;
  }

  private rand(): number {
    // xorshift32
    let x = this.prngState;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.prngState = x >>> 0;
    return (this.prngState & 0xffffffff) / 0x100000000;
  }

  updateSeen(tokenId: number): void {
    this.seen.set(tokenId, (this.seen.get(tokenId) ?? 0) + 1);
  }

  nextToken(logits: Float32Array): number {
    // Apply repetition penalty
    const adjusted = new Float32Array(logits.length);
    for (let i = 0; i < logits.length; i++) {
      const count = this.seen.get(i) ?? 0;
      adjusted[i] = logits[i] - Math.log(this.opts.repetition_penalty) * count;
    }

    // Softmax with temperature
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

    // Top-k
    const k = Math.min(this.opts.top_k, probs.length);
    const indices = Array.from(probs.keys());
    indices.sort((a, b) => probs[b] - probs[a]);
    const topIdx = indices.slice(0, k);

    // Top-p
    let cumulative = 0;
    const nucleus: number[] = [];
    for (const i of topIdx) {
      nucleus.push(i);
      cumulative += probs[i];
      if (cumulative >= (this.opts.top_p ?? 1)) break;
    }

    if (this.opts.deterministic) {
      return nucleus[0] ?? topIdx[0] ?? 0;
    }

    // Sample
    let r = this.rand();
    let acc = 0;
    for (const i of nucleus) {
      acc += probs[i];
      if (r <= acc) return i;
    }
    return nucleus[nucleus.length - 1] ?? 0;
  }
}


