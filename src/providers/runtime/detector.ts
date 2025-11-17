/**
 * Runtime detection utilities
 * Detects which runtimes are available without requiring them as dependencies
 */

export interface AvailableRuntimes {
  transformers: boolean;
  transformersUrl?: string; // CDN URL if available
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
    // Try to dynamically import - works in Node.js and browser with import maps
    const module = await import('@huggingface/transformers');
    // Verify it's actually loaded by checking if module exists
    if (module && typeof module === 'object') {
      runtimes.transformers = true;
      
      // In browser, try to detect CDN URL from import map
      if (typeof window !== 'undefined') {
        try {
          // Check if import maps are available and extract URL
          const scripts = Array.from(document.querySelectorAll('script[type="importmap"]'));
          for (const script of scripts) {
            const importMap = JSON.parse(script.textContent || '{}');
            if (importMap.imports?.['@huggingface/transformers']) {
              runtimes.transformersUrl = importMap.imports['@huggingface/transformers'];
              break;
            }
          }
        } catch (e) {
          // Ignore import map detection errors
        }
      }
    }
  } catch (error: any) {
    // In browser environments, try alternative detection methods
    if (typeof window !== 'undefined') {
      try {
        // Method 1: Try using eval to bypass bundler transformations
        // This works better with import maps
        const module = await eval('import("@huggingface/transformers")');
        if (module && typeof module === 'object') {
          runtimes.transformers = true;
          
          // Try to detect CDN URL from import map
          try {
            const scripts = Array.from(document.querySelectorAll('script[type="importmap"]'));
            for (const script of scripts) {
              const importMap = JSON.parse(script.textContent || '{}');
              if (importMap.imports?.['@huggingface/transformers']) {
                runtimes.transformersUrl = importMap.imports['@huggingface/transformers'];
                break;
              }
            }
          } catch (e) {
            // Ignore import map detection errors
          }
        }
      } catch (evalError: any) {
        // Method 2: Check if it's available as a global (for UMD builds)
        if ((window as any).transformers || (window as any).Transformers) {
          runtimes.transformers = true;
        } else {
          // Log only if not a typical module not found error
          const errorMessage = evalError?.message || evalError?.toString() || '';
          const isModuleNotFound = 
            errorMessage.includes('Cannot find module') ||
            errorMessage.includes('Failed to resolve module') ||
            errorMessage.includes('Cannot resolve') ||
            errorMessage.includes('not found') ||
            evalError?.code === 'MODULE_NOT_FOUND';
          
          if (!isModuleNotFound) {
            console.warn('Unexpected error checking for Transformers.js:', errorMessage);
          }
        }
      }
    } else {
      // Node.js environment - check for MODULE_NOT_FOUND
      if (error.code !== 'MODULE_NOT_FOUND') {
        console.warn('Unexpected error checking for Transformers.js:', error.message);
      }
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
        'Install it with: npm install @huggingface/transformers\n' +
        'Or use an import map in browser: https://cdn.jsdelivr.net/npm/@huggingface/transformers\n\n' +
        'For cloud-only usage, use a cloud provider configuration instead.'
      );
    default:
      return `Unknown runtime: ${runtime}`;
  }
}
