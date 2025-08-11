export type FeatureFlags = {
  enableSpeculativeDecoding: boolean;
  enableLocalRag: boolean;
  preferWebGPU: boolean;
};

const defaultFlags: FeatureFlags = {
  enableSpeculativeDecoding: false,
  enableLocalRag: false,
  preferWebGPU: true,
};

let currentFlags: FeatureFlags = { ...defaultFlags };

export function setFeatureFlags(flags: Partial<FeatureFlags>): void {
  currentFlags = { ...currentFlags, ...flags };
}

export function getFeatureFlags(): FeatureFlags {
  return currentFlags;
}


