/**
 * Runtime detection utilities
 * Detects which runtimes are available without requiring them as dependencies
 */

export interface AvailableRuntimes {
  transformers: boolean;
}

/**
 * Detect which device runtimes are available
 * Uses dynamic imports to check without hard dependencies
 */
export async function detectAvailableRuntimes(): Promise<AvailableRuntimes> {
  const runtimes: AvailableRuntimes = {
    transformers: false,
  };

  // Check Transformers.js
  try {
    await import('@huggingface/transformers');
    runtimes.transformers = true;
  } catch (error: any) {
    // Runtime not available
    if (error.code !== 'MODULE_NOT_FOUND') {
      // Log unexpected errors
      console.warn('Unexpected error checking for Transformers.js:', error.message);
    }
  }

  return runtimes;
}

/**
 * Check if a specific runtime is available
 */
export async function isRuntimeAvailable(runtime: 'transformers-js'): Promise<boolean> {
  const available = await detectAvailableRuntimes();
  
  switch (runtime) {
    case 'transformers-js':
      return available.transformers;
    default:
      return false;
  }
}

/**
 * Get a user-friendly error message when a runtime is not available
 */
export function getRuntimeErrorMessage(runtime: 'transformers-js'): string {
  switch (runtime) {
    case 'transformers-js':
      return (
        'Transformers.js runtime requires @huggingface/transformers.\n' +
        'Install it with: npm install @huggingface/transformers\n\n' +
        'For cloud-only usage, use a cloud provider configuration instead.'
      );
    default:
      return `Unknown runtime: ${runtime}`;
  }
}
