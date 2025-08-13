import { type CreateSessionArgs, type GenerateArgs, type Session, type TokenStreamChunk } from '../types/api';
import { pipeline as hfPipeline, TextStreamer, env as hfEnv } from '@huggingface/transformers';

export async function createSession(args: CreateSessionArgs): Promise<Session> {
  if (args.hfToken) {
    try {
      // Best-effort: set global token if supported by the library
      (hfEnv as any).HF_TOKEN = args.hfToken;
    } catch {}
  }

  // Initialize a text-generation pipeline for the requested model
  const generator: any = await hfPipeline('text-generation', args.model, { device: "webgpu" });

  let disposed = false;

  async function* generate(gen: GenerateArgs): AsyncIterable<TokenStreamChunk> {
    if (disposed) throw new Error('Session disposed');

    const messages = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content:  gen.prompt ?? '' },
    ];
 
    const queue: TokenStreamChunk[] = [];
    let done = false;
    let first = true;
    const ttfbStart = performance.now();

    const streamer = new TextStreamer(generator.tokenizer, {
      skip_prompt: true,
      callback_function: (text: string) => {
        console.log('text', text);
        const chunk: TokenStreamChunk = {
          token: text,
          tokenId: -1,
          isFirst: first,
          isLast: false,
          ...(first ? { ttfbMs: performance.now() - ttfbStart } : {}),
        };
        first = false;
        queue.push(chunk);
      },
    });

    // Kick off generation but do not await; stream via callback
    const generationPromise = generator(messages, {
      max_new_tokens: 512,
      do_sample: gen.temperature !== undefined ? gen.temperature > 0 : false,
      temperature: gen.temperature,
      top_p: gen.top_p,
      top_k: gen.top_k,
      streamer,
      stop: gen.stop,
    }).finally(() => { done = true; });

    try {
      while (!done || queue.length) {
        if (queue.length) {
          yield queue.shift()!;
        } else {
          await new Promise((r) => setTimeout(r, 1));
        }
      }
      yield { token: '', tokenId: -1, isFirst: false, isLast: true };
    } finally {
      await generationPromise.catch(() => {});
    }
  }

  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    try { await generator?.dispose?.(); } catch {}
  }

  const session: Session = { generate, dispose };
  return session;
}


