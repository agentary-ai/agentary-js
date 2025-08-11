export interface Tokenizer {
  encode(text: string): number[];
  decode(ids: number[]): string;
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


