// Minimal worker wiring for WASM placeholder path
export type WorkerInit = {
  modelBuffers: ArrayBuffer[]; // shards
  tokenizerBytes?: ArrayBuffer;
  plan: { engine: 'wasm' | 'webgpu' | 'webnn'; quant: string; ctx: number };
};

export type WorkerCommands =
  | { type: 'init'; payload: WorkerInit }
  | { type: 'generate'; payload: { inputIds: number[]; opts: any } }
  | { type: 'dispose' };

export type WorkerEvents =
  | { type: 'ready' }
  | { type: 'token'; tokenId: number; ttfbMs?: number }
  | { type: 'done' }
  | { type: 'error'; message: string };

let ready = false;
let ttfbStart = 0;

self.onmessage = async (ev: MessageEvent<WorkerCommands>) => {
  try {
    const msg = ev.data;
    switch (msg.type) {
      case 'init': {
        // TODO: load WASM / WebGPU kernels based on plan
        // For now, pretend to initialize
        ready = true;
        (self as any).postMessage({ type: 'ready' });
        break;
      }
      case 'generate': {
        if (!ready) throw new Error('Worker not initialized');
        ttfbStart = performance.now();
        // Placeholder: echo tokens with small delay
        const ids = msg.payload.inputIds;
        for (let i = 0; i < ids.length; i++) {
          if (i === 0) {
            (self as any).postMessage({ type: 'token', tokenId: ids[i], ttfbMs: performance.now() - ttfbStart });
          } else {
            (self as any).postMessage({ type: 'token', tokenId: ids[i] });
          }
          await new Promise((r) => setTimeout(r, 10));
        }
        (self as any).postMessage({ type: 'done' });
        break;
      }
      case 'dispose': {
        close();
        break;
      }
    }
  } catch (e: any) {
    (self as any).postMessage({ type: 'error', message: e?.message ?? String(e) });
  }
};


