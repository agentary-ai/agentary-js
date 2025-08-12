import { createLogger } from './logger';
const log = createLogger('capabilities');

export type CapabilityReport = {
  webgpu: boolean;
  webnn: boolean;
  wasmSimd: boolean;
  wasmThreads: boolean;
  crossOriginIsolated: boolean;
  deviceMemoryGB?: number;
  battery?: {
    charging?: boolean;
    level?: number; // 0..1
  };
  maxMemoryBudgetMB: number;
};

async function checkWasmFeatures(): Promise<{ wasmSimd: boolean; wasmThreads: boolean }>
{
  // Basic feature detection via WebAssembly features
  const simd = (WebAssembly as any).validate?.(
    new Uint8Array([
      0, 97, 115, 109, // magic
      1, 0, 0, 0, // version
    ]),
  );
  // Not reliable; threads require headers. We check env flags.
  const threads = typeof SharedArrayBuffer !== 'undefined' && (self as any).crossOriginIsolated === true;

  log.debug('checkWasmFeatures', { simd, threads });

  return { wasmSimd: !!simd, wasmThreads: !!threads };
}

async function getBattery(): Promise<{ charging?: boolean; level?: number } | undefined> {
  try {
    const nav: any = navigator;
    if (nav?.getBattery) {
      const b = await nav.getBattery();
      return { charging: b.charging, level: b.level };
    }
  } catch {}
  return undefined;
}

export async function probeCapabilities(): Promise<CapabilityReport> {
  const t0 = performance.now();
  const log = (await import('./logger.js')).createLogger('capabilities');
  const webgpu = typeof (navigator as any).gpu !== 'undefined';
  const webnn = typeof (navigator as any).ml !== 'undefined';
  const { wasmSimd, wasmThreads } = await checkWasmFeatures();
  const crossOriginIsolated = (self as any).crossOriginIsolated === true;
  const dm = (navigator as any).deviceMemory; // in GB, not widely supported
  const battery = await getBattery();

  // Estimate memory budget conservatively
  const deviceMemoryGB = typeof dm === 'number' ? dm : undefined;
  const maxMemoryBudgetMB = Math.floor((deviceMemoryGB ?? 4) * 1024 * 0.45);

  const base = {
    webgpu,
    webnn,
    wasmSimd,
    wasmThreads,
    crossOriginIsolated,
    maxMemoryBudgetMB,
  } as const;

  const report: CapabilityReport = {
    ...base,
    ...(typeof deviceMemoryGB === 'number' ? { deviceMemoryGB } : {}),
    ...(battery ? { battery } : {}),
  };

  log.info('probe completed', { durationMs: Math.round(performance.now() - t0), ...report });

  return report;
}

export type Plan = {
  engine: 'webgpu' | 'wasm' | 'webnn';
  quant: 'q4' | 'q5' | 'q8' | 'f16';
  ctx: number;
};

export function planExecution(
  desiredEngine: 'auto' | 'webgpu' | 'wasm' | 'webnn',
  desiredCtx: number | undefined,
  report: CapabilityReport,
): Plan {
  const preferGpu = desiredEngine === 'webgpu' || (desiredEngine === 'auto' && report.webgpu);
  const engine: Plan['engine'] = preferGpu ? 'webgpu' : report.wasmSimd ? 'wasm' : report.webnn ? 'webnn' : 'wasm';

  let quant: Plan['quant'] = engine === 'webgpu' ? 'q4' : 'q4';

  // Context length capping based on memory budget
  const targetCtx = desiredCtx ?? 4096;
  const perTokenKVBytes = engine === 'webgpu' ? 2 /* fp16 approx per head params, placeholder */ : 1.5; // MB per 1k tokens placeholder
  const kvBudgetMB = Math.max(64, Math.floor(report.maxMemoryBudgetMB * 0.5));
  const ctxFromBudget = Math.max(1024, Math.floor((kvBudgetMB / perTokenKVBytes) * 1000));
  const ctx = Math.min(targetCtx, ctxFromBudget);

  return { engine, quant, ctx };
}


