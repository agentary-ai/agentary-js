import { streamAndCache } from '../runtime/manifest.js';
import { createLogger } from '../runtime/logger.js';

export interface Tokenizer {
  encode(text: string): number[];
  decode(ids: number[]): string;
}

/**
 * Downloads a tokenizer.json file from the given URL
 * @param url The URL to download the tokenizer.json from
 * @param options Optional configuration object
 * @param options.sri Optional subresource integrity hash for verification
 * @param options.token Optional authentication token (e.g., Hugging Face token)
 * @param options.headers Optional custom headers to include in the request
 * @returns Promise that resolves to the tokenizer configuration object
 */
export async function downloadTokenizer(
  url: string, 
  options?: { 
    sri?: string; 
    token?: string; 
    headers?: HeadersInit; 
  }
): Promise<any> {
  const log = createLogger('tokenizer');
  log.info('downloading tokenizer', { url });
  
  try {
    // Build request headers
    const headersObj: Record<string, string> = {};
    
    // Copy existing headers if they are an object
    if (options?.headers) {
      if (Array.isArray(options.headers)) {
        // Handle array format
        for (const [key, value] of options.headers) {
          headersObj[key] = value;
        }
      } else if (options.headers instanceof Headers) {
        // Handle Headers object
        options.headers.forEach((value, key) => {
          headersObj[key] = value;
        });
      } else {
        // Handle plain object
        Object.assign(headersObj, options.headers);
      }
    }
    
    // Add authentication token if provided
    if (options?.token) {
      headersObj.Authorization = `Bearer ${options.token}`;
    }
    
    const init: RequestInit = Object.keys(headersObj).length > 0 ? { headers: headersObj } : {};
    const buffer = await streamAndCache(url, options?.sri, init);
    const text = new TextDecoder().decode(buffer);
    const tokenizerConfig = JSON.parse(text);
    
    log.info('tokenizer downloaded successfully', { url, size: buffer.byteLength });
    return tokenizerConfig;
  } catch (error) {
    log.error('failed to download tokenizer', { url, error: String(error) });
    throw new Error(`Failed to download tokenizer from ${url}: ${error}`);
  }
}

// Placeholder simple whitespace tokenizer for MVP wiring
export class SimpleWhitespaceTokenizer implements Tokenizer {
  private vocab: Map<string, number> = new Map();
  private rev: Map<number, string> = new Map();

  constructor() {
    // Seed with a few special tokens
    this.addToken('<BOS>');
    this.addToken('<EOS>');
  }

  private addToken(tok: string): number {
    if (this.vocab.has(tok)) return this.vocab.get(tok)!;
    const id = this.vocab.size;
    this.vocab.set(tok, id);
    this.rev.set(id, tok);
    return id;
  }

  encode(text: string): number[] {
    const parts = text.split(/\s+/).filter(Boolean);
    const ids: number[] = [];
    for (const p of parts) ids.push(this.addToken(p));
    return ids;
  }

  decode(ids: number[]): string {
    return ids.map((i) => this.rev.get(i) ?? '').join(' ');
  }
}


